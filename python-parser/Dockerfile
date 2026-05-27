# python_parser/Dockerfile

# 1. 使用官方轻量级 Python 镜像
FROM xuanyuan.run/library/python:3.11.15

# 2. 设置环境变量，防止 Python 缓冲 stdout 和 stderr，避免日志丢失
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# 3. 设置工作目录
WORKDIR /app

# 4. (可选) 配置国内清华源，大幅提升国内服务器的构建速度
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 5. 优先复制依赖清单并安装，利用 Docker 的层缓存机制加速二次构建
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. 复制所有 Python 源码到容器中
COPY . .

# 7. 暴露 FastAPI 默认端口
EXPOSE 9002

# 8. 启动服务
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9002"]