output "external_ip" {
  description = "VM の外部静的 IPv4"
  value       = google_compute_address.static_ip.address
}

output "ssh_command" {
  description = "SSH で接続するためのコマンド（ユーザー名は状況により変更）"
  value       = "gcloud compute ssh ${google_compute_instance.vm.name} --zone ${var.zone}"
}

