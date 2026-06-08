resource "google_compute_address" "static_ip" {
  name   = "${var.name_prefix}-ip"
  region = var.region
}

resource "google_compute_resource_policy" "work_hours_schedule" {
  count  = var.enable_vm_work_hours_schedule ? 1 : 0
  name   = "${var.name_prefix}-work-hours-schedule"
  region = var.region

  instance_schedule_policy {
    vm_start_schedule {
      schedule = var.vm_start_schedule
    }

    vm_stop_schedule {
      schedule = var.vm_stop_schedule
    }

    time_zone = var.vm_schedule_time_zone
  }
}

resource "google_compute_instance" "vm" {
  name         = "${var.name_prefix}-vm"
  machine_type = var.machine_type
  zone         = var.zone

  allow_stopping_for_update = var.allow_stopping_for_update

  resource_policies = var.enable_vm_work_hours_schedule ? [
    google_compute_resource_policy.work_hours_schedule[0].self_link,
  ] : []

  tags = ["${var.name_prefix}-web"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.boot_disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id

    access_config {
      nat_ip = google_compute_address.static_ip.address
    }
  }

  # 注意：Windows で編集すると heredoc に CRLF（\r\n）が混ざり、
  # /usr/bin/env: ‘bash\r’: No such file or directory で失敗することがある。
  # そのため明示的に \r を除去して Linux 側では LF のみになるようにする。
  metadata_startup_script = replace(<<-EOT
#!/usr/bin/env bash
set -euo pipefail

# 基本ツール
apt-get update
apt-get install -y ca-certificates curl git

# Docker インストール
curl -fsSL https://get.docker.com | sh

# ここに「git clone」「docker compose up」などを追加すれば B（デプロイ自動化）になる
# 例：
# mkdir -p /opt/aituber-kit
# git clone https://github.com/ORG/REPO.git /opt/aituber-kit
# cd /opt/aituber-kit
# docker compose -f docker-compose.gcp.yml up -d --build
EOT
  , "\r", "")
}
