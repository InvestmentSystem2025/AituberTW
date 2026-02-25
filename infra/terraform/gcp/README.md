# Terraform (GCP) - 最小骨架

這個資料夾是一個「最小可跑」的 Terraform 專案，用來建立：

- VPC + Subnet
- Firewall（開 22/80/443）
- Static External IP
- Compute Engine VM（Ubuntu 22.04, e2-medium）
- VM startup script（cloud-init / metadata_startup_script）自動安裝 Docker（對應你想做的 A + B）

## 先決條件

1. 已安裝 Terraform（建議 1.6+）
2. 已安裝 gcloud 並登入

## 登入（兩種其一）

### 方法 1：用 gcloud 的 ADC（推薦新手）

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_GCP_PROJECT_ID
```

### 方法 2：Service Account Key（進階）

略（之後再補）

## 使用方式

在此資料夾執行：

```bash
cd infra/terraform/gcp
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

## prod/stg：Terraform workspace（本機 state）

同一份 `.tf` 程式碼可用 workspace 建立兩套完全隔離的環境（prod/stg 各自一份 state）。

1) 準備變數檔（不 commit）：

```bash
cp terraform.prod.tfvars.example terraform.prod.tfvars
cp terraform.stg.tfvars.example terraform.stg.tfvars
```

2) 建立/切換 workspace 並套用：

```bash
terraform init

terraform workspace new prod || true
terraform workspace select prod
terraform apply -var-file=terraform.prod.tfvars

terraform workspace new stg || true
terraform workspace select stg
terraform apply -var-file=terraform.stg.tfvars
```

各 workspace 套用後可用 `terraform output external_ip` 取得對應的 static IP。

刪除資源：

```bash
terraform destroy
```

## 下一步（你要的 B）

目前 `compute.tf` 的 `metadata_startup_script` 只會裝 Docker。
你可以把「clone repo + docker compose up」放進去，做到 VM 建好就自動部署應用程式。

