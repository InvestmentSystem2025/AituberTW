variable "project_id" {
  description = "GCP Project ID（例: my-project-123456）"
  type        = string
}

variable "region" {
  description = "GCP Region（例: asia-east1）"
  type        = string
  default     = "asia-east1"
}

variable "zone" {
  description = "GCP Zone（例: asia-east1-a）"
  type        = string
  default     = "asia-east1-a"
}

variable "name_prefix" {
  description = "作成するリソース名の接頭辞"
  type        = string
  default     = "ai-interview"
}

variable "machine_type" {
  description = "Compute Engine のマシンタイプ"
  type        = string
  default     = "e2-medium"
}

variable "boot_disk_size_gb" {
  description = "VM のブートディスク容量（GB）"
  type        = number
  default     = 50
}

variable "ssh_source_ranges" {
  description = "SSH(22) を許可する送信元 CIDR（最初は自分のIPだけにするのが安全）"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

