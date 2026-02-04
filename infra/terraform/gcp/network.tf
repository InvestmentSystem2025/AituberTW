resource "google_compute_network" "vpc" {
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.name_prefix}-subnet"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.10.0.0/24"
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.name_prefix}-allow-ssh"
  network = google_compute_network.vpc.name

  direction = "INGRESS"
  priority  = 1000

  target_tags = ["${var.name_prefix}-web"]

  source_ranges = var.ssh_source_ranges

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "${var.name_prefix}-allow-http-https"
  network = google_compute_network.vpc.name

  direction = "INGRESS"
  priority  = 1000

  target_tags = ["${var.name_prefix}-web"]

  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

