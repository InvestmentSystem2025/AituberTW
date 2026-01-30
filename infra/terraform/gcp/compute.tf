resource "google_compute_address" "static_ip" {
  name   = "${var.name_prefix}-ip"
  region = var.region
}

resource "google_compute_instance" "vm" {
  name         = "${var.name_prefix}-vm"
  machine_type = var.machine_type
  zone         = var.zone

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

