from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import pdfplumber
import docx
import io
import json
import httpx
import os
import uuid
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 10 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse")
async def parse_resume(
    file: UploadFile = File(...),
    api_base_url: str = Form(...),
    api_key: str = Form(...),
    model: str = Form(...),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "仅支持 PDF 和 DOCX 文件")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "文件大小不能超过 10MB")

    text = extract_text(content, file.content_type)
    if not text or len(text.strip()) < 20:
        raise HTTPException(400, "未能从文件中提取到有效文本，请检查文件内容")

    logger.info(f"Extracted {len(text)} chars, calling LLM...")
    result = await extract_resume_fields(text, api_base_url, api_key, model)
    return result


def extract_text(content: bytes, file_type: str) -> str:
    if file_type == "application/pdf":
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            parts = []
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    parts.append(t)
            return "\n\n".join(parts)
    elif "wordprocessingml" in file_type or "document" in file_type:
        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return ""


RESUME_JSON_SCHEMA = """
{
  "personal": {
    "name": "",
    "targetPosition": "",
    "phone": "",
    "email": "",
    "gender": "",
    "education": "",
    "city": "",
    "personalAccount": "",
    "website": "",
    "github": "",
    "linkedin": "",
    "workYears": "",
    "politics": "",
    "age": "",
    "hometown": "",
    "avatar": "",
    "avatarShape": "circle",
    "extraInfos": []
  },
  "education": { "items": [{ "id": "uuid", "school": "", "major": "", "degree": "", "startDate": "", "endDate": "", "gpa": "", "honors": "", "schoolExperience": "" }] },
  "work": { "items": [{ "id": "uuid", "company": "", "position": "", "department": "", "startDate": "", "endDate": "", "description": "", "companySize": "" }] },
  "project": { "items": [{ "id": "uuid", "name": "", "role": "", "startDate": "", "endDate": "", "description": "", "link": "", "techStack": [] }] },
  "skills": { "content": "", "displayMode": "tags", "items": [{ "id": "uuid", "name": "", "level": 3 }] },
  "summary": { "content": "" },
  "awards": { "items": [{ "id": "uuid", "name": "", "level": "", "date": "", "description": "" }] },
  "certificates": { "items": [{ "id": "uuid", "name": "", "date": "", "issuer": "" }] },
  "languages": { "items": [{ "id": "uuid", "language": "", "level": "" }] },
  "portfolio": { "items": [{ "id": "uuid", "title": "", "url": "", "description": "" }] }
}
"""


async def extract_resume_fields(
    text: str, api_base_url: str, api_key: str, model: str
) -> dict:
    prompt = f"""你是一位专业的简历解析专家。请从以下简历文本中提取所有信息，输出严格符合 JSON Schema 的结构化数据。

## 输出要求
- 所有日期字段格式为 "YYYY-MM" 或 "YYYY-MM-DD"
- 缺失的字段填空字符串 ""
- 每个模块的 items 数组中，每项必须有唯一的 id (UUID 格式)
- 技能熟练度 level: 1=入门 2=熟悉 3=熟练 4=精通
- 学历 degree: 初中/中专/高中/大专/本科/硕士/博士
- 性别 gender: 男/女 (可从文本推断)
- 语言等级 level: 母语/流利/良好/一般
- 只输出有内容的模块，空数组的模块可以省略

## JSON Schema
```json
{RESUME_JSON_SCHEMA}
```

## 简历文本
{text}

请直接输出 JSON，不要包含 markdown 代码块标记。"""

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{api_base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
        )
        if resp.status_code == 401:
            raise HTTPException(401, "AI 服务认证失败，请检查 API Key 是否正确")
        if resp.status_code == 403:
            raise HTTPException(403, "AI 服务访问被拒绝，请检查 API Key 权限")
        if resp.status_code == 429:
            raise HTTPException(429, "AI 服务请求过于频繁，请稍后重试")
        if resp.status_code >= 500:
            raise HTTPException(502, f"AI 服务内部错误 (HTTP {resp.status_code})，请稍后重试")
        if resp.status_code >= 400:
            detail = ""
            try:
                err_body = resp.json()
                detail = err_body.get("error", {}).get("message", "")
            except Exception:
                detail = resp.text[:200]
            raise HTTPException(resp.status_code, f"AI 服务请求失败: {detail}" if detail else f"AI 服务请求失败 (HTTP {resp.status_code})")

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9002, reload=True)