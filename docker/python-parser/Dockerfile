FROM python:3.12-slim
WORKDIR /app
COPY python-parser/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY python-parser/ .
EXPOSE 9002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9002"]
