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

variable "allow_stopping_for_update" {
  description = "インスタンス更新のために停止を許可する（machine_type 変更など）"
  type        = bool
  default     = false
}

variable "enable_vm_work_hours_schedule" {
  description = "VM の勤務時間 start/stop schedule を有効化する"
  type        = bool
  default     = false
}

variable "vm_schedule_time_zone" {
  description = "VM start/stop schedule のタイムゾーン"
  type        = string
  default     = "Asia/Taipei"
}

variable "vm_start_schedule" {
  description = "VM start schedule（cron 形式）。例: 台湾時間 08:45"
  type        = string
  default     = "45 8 * * *"
}

variable "vm_stop_schedule" {
  description = "VM stop schedule（cron 形式）。例: 台湾時間 18:00"
  type        = string
  default     = "0 18 * * *"
}
