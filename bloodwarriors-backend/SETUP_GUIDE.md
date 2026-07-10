# RaktaSetu AI — Complete Setup Guide

## Table of Contents
1. [Local Development Setup](#1-local-development-setup)
2. [AWS EC2 Deployment](#2-aws-ec2-deployment-zero-budget)
3. [Testing with Swagger UI](#3-testing-with-swagger-ui)
4. [Troubleshooting](#4-troubleshooting)

---

## 1. Local Development Setup

### Prerequisites
- Python 3.11+ installed
- Git installed
- Terminal / PowerShell

### Step-by-Step

```bash
# 1. Clone or navigate to the project directory
cd bloodwarriors-backend

# 2. Create a Python virtual environment
python -m venv venv

# 3. Activate the virtual environment
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On Windows (CMD):
.\venv\Scripts\activate.bat
# On macOS/Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create the .env file from the template
copy .env.example .env
# On macOS/Linux: cp .env.example .env

# 6. Verify .env has USE_MOCK_BEDROCK=True (for local testing)
# Open .env and confirm: USE_MOCK_BEDROCK=True
```

### Train the ML Model

```bash
# 7. Run the ML training pipeline
python ml/train_model.py

# Expected output:
# ============================================================
#   RaktaSetu AI — ML Training Pipeline
# ============================================================
# [1/6] Loading dataset from: .../Dataset.csv
#        Shape: 7034 rows × 31 columns
# [2/6] Creating target variable 'has_donated'...
# [3/6] Dropping non-feature columns...
# [4/6] Converting boolean and date columns...
# [5/6] One-hot encoding categorical features...
# [6/6] Training RandomForestClassifier...
# 
# ===== Classification Report =====
#   (precision, recall, f1-score for both classes)
# 
# ✅ Model exported to: app/donor_rf_model.joblib
```

### Start the Server

```bash
# 8. Start FastAPI with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Expected output:
# 🩸 RaktaSetu AI — Starting Up
# ✅ SQLite database initialized
# ✅ ML model loaded
# Server ready. Open http://localhost:8000/docs for Swagger UI
```

### Ingest the CSV Data

```bash
# 9. In a NEW terminal, import the CSV data into SQLite
curl -X POST http://localhost:8000/ingest-csv

# On Windows PowerShell (if curl isn't available):
Invoke-RestMethod -Uri "http://localhost:8000/ingest-csv" -Method POST
```

### Verify Everything Works

```bash
# 10. Health check
curl http://localhost:8000/

# 11. Test triage
curl -X POST http://localhost:8000/triage ^
  -H "Content-Type: application/json" ^
  -d "{\"patient_description\": \"Critical: Patient bleeding heavily after accident\", \"blood_group_needed\": \"O Positive\"}"

# 12. Test match
curl -X POST http://localhost:8000/match ^
  -H "Content-Type: application/json" ^
  -d "{\"blood_group\": \"O Positive\", \"urgency\": \"CRITICAL\", \"max_results\": 5}"

# 13. Test chat
curl -X POST http://localhost:8000/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"session_id\": \"test-1\", \"message\": \"When can I donate blood again?\"}"
```

---

## 2. AWS EC2 Deployment (Zero Budget)

### Step 1: Launch an EC2 Instance

1. Go to [AWS Console → EC2](https://console.aws.amazon.com/ec2/)
2. Click **Launch Instance**
3. Configure:
   - **Name**: `raktasetu-ai`
   - **OS**: Ubuntu Server 22.04 LTS (Free Tier eligible)
   - **Instance Type**: `t2.micro` (Free Tier — 1 vCPU, 1 GB RAM)
   - **Key Pair**: Create new → Download `.pem` file → Save securely
   - **Security Group**: Create new with these rules:
     | Type | Port | Source |
     |------|------|--------|
     | SSH | 22 | My IP |
     | Custom TCP | 8000 | 0.0.0.0/0 (or My IP) |
   - **Storage**: 8 GB gp3 (default, Free Tier eligible)
4. Click **Launch Instance**
5. Note the **Public IPv4 address** from the instance details

### Step 2: SSH into the Instance

```bash
# On your local machine (replace with your actual values):

# Make the key file read-only (macOS/Linux)
chmod 400 ~/Downloads/raktasetu-ai.pem

# SSH into the instance
ssh -i ~/Downloads/raktasetu-ai.pem ubuntu@<YOUR-EC2-PUBLIC-IP>

# On Windows (PowerShell):
ssh -i C:\Users\YourName\Downloads\raktasetu-ai.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
```

### Step 3: Install System Dependencies

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install Python 3.11 and essential tools
sudo apt install -y python3.11 python3.11-venv python3-pip git screen

# Verify Python version
python3.11 --version
# Expected: Python 3.11.x
```

### Step 4: Clone the Project

```bash
# Clone from your Git repository
# Option A: GitHub
git clone https://github.com/<your-username>/bloodwarriors-backend.git

# Option B: If not using Git, use scp to copy from local machine
# (run this from your LOCAL machine, not EC2):
# scp -i ~/Downloads/raktasetu-ai.pem -r ./bloodwarriors-backend ubuntu@<YOUR-EC2-PUBLIC-IP>:~/

# Navigate to the project
cd bloodwarriors-backend
```

### Step 5: Set Up Python Environment

```bash
# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Verify installation
python -c "import fastapi; import sklearn; import kuzu; print('All packages OK')"
```

### Step 6: Configure Environment Variables

```bash
# Create .env from template
cp .env.example .env

# Edit the .env file
nano .env
```

**For testing (mock mode) — no AWS credentials needed:**
```env
USE_MOCK_BEDROCK=True
SQLITE_DB_PATH=data/raktasetu.db
KUZU_DB_PATH=data/kuzu_db
APP_HOST=0.0.0.0
APP_PORT=8000
```

**For production (real Bedrock) — configure AWS credentials:**
```env
USE_MOCK_BEDROCK=False
AWS_ACCESS_KEY_ID=AKIA...your-key...
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

> **Tip**: On EC2, it's better to use an IAM Instance Role instead of
> hardcoding credentials. Attach a role with `bedrock:InvokeModel`
> permission to your EC2 instance via the AWS Console.

Save and exit nano: `Ctrl+O`, `Enter`, `Ctrl+X`

### Step 7: Train the ML Model

```bash
python ml/train_model.py

# Wait for training to complete (~30-60 seconds on t2.micro)
# Verify the model was created:
ls -la app/donor_rf_model.joblib
```

### Step 8: Start the Server (Keep Alive in Background)

**Option A: Using `screen` (Recommended for beginners)**

```bash
# Create a new screen session
screen -S raktasetu

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Ingest CSV data (open a second terminal/screen window):
# Press Ctrl+A then C to create a new screen window
curl -X POST http://localhost:8000/ingest-csv

# Detach from screen (server keeps running):
# Press Ctrl+A then D

# To re-attach later:
screen -r raktasetu

# To list all screen sessions:
screen -ls
```

**Option B: Using `nohup`**

```bash
# Start server in background
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

# Save the process ID
echo $! > server.pid

# Ingest CSV data
sleep 5  # Wait for server to start
curl -X POST http://localhost:8000/ingest-csv

# View logs
tail -f server.log

# To stop the server later:
kill $(cat server.pid)
```

### Step 9: Verify the Deployment

From your **local machine** (not SSH):

```bash
# Replace <YOUR-EC2-PUBLIC-IP> with your actual IP

# Health check
curl http://<YOUR-EC2-PUBLIC-IP>:8000/

# Swagger UI (open in browser)
# http://<YOUR-EC2-PUBLIC-IP>:8000/docs

# Test triage
curl -X POST http://<YOUR-EC2-PUBLIC-IP>:8000/triage \
  -H "Content-Type: application/json" \
  -d '{"patient_description": "Emergency: patient needs blood for surgery tomorrow", "blood_group_needed": "B Positive"}'
```

---

## 3. Testing with Swagger UI

Open `http://localhost:8000/docs` (local) or `http://<EC2-IP>:8000/docs` in your browser.

### Test Payloads

**POST /triage** — AI Urgency Classification:
```json
{
    "patient_description": "Critical: Patient is bleeding heavily after a car accident, needs O Negative blood immediately",
    "blood_group_needed": "O Negative"
}
```

**POST /match** — Hybrid-Ranked Donor Matching:
```json
{
    "blood_group": "O Positive",
    "urgency": "CRITICAL",
    "max_results": 5
}
```

**POST /chat** — RAG Chat:
```json
{
    "session_id": "demo-session-001",
    "message": "What blood groups are compatible with O Positive?",
    "user_id": "demo-user"
}
```

**POST /feedback** — Feedback Collection:
```json
{
    "user_id": "demo-user",
    "user_role": "donor",
    "rating": 5,
    "comment": "Excellent matching accuracy!",
    "endpoint_used": "/match"
}
```

**PATCH /donors/1/consent** — Revoke Consent:
```json
{
    "consent_given": false
}
```

---

## 4. Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'app'` | Run uvicorn from the project root directory |
| `ML model not found` | Run `python ml/train_model.py` first |
| `/match returns empty` | POST to `/ingest-csv` to import donor data |
| `Port 8000 already in use` | `lsof -i :8000` then `kill <PID>` (Linux) or `netstat -ano \| findstr :8000` (Windows) |
| `KùzuDB import error` | `pip install kuzu` — may need `pip install kuzu --no-cache-dir` on t2.micro |
| EC2 can't be reached on port 8000 | Check Security Group inbound rules allow TCP 8000 |
| `Permission denied` on .pem file | `chmod 400 your-key.pem` |
| Out of memory on t2.micro | Add 1GB swap: `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
