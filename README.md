# PingX

A high-performance, concurrent network monitoring tool built in Go that provides real-time ping statistics and monitoring capabilities.

## Features

- **High Performance**: Concurrent ping operations with configurable concurrency limits
- **Real-time Statistics**: Track min/max/avg latency, packet loss, and standard deviation
- **Continuous Monitoring**: Automated periodic ping checks with configurable intervals
- **History Tracking**: Maintains historical ping data with configurable retention
- **Multiple Target Support**: Monitor multiple hosts simultaneously
- **CIDR Support**: Optional first/last address skipping for CIDR ranges
- **Web Interface**: Built-in web UI for real-time monitoring

## ScreeShot
![PingX Demo](/docs/demo.png)

## Quick Start

### Prerequisites

- Go 1.19 or later
- Modern web browser

### Installation

```bash
git clone https://github.com/netty-community/pingx.git
cd pingx
go mod download
```

### Running PingX

```bash
go run main.go
```

The web interface will be available at `http://localhost:8080` by default.

## Configuration

PingX can be configured through environment variables or configuration files. Key configuration options include:

- `interval`: Time between ping operations (milliseconds)
- `count`: Number of ping packets to send
- `timeout`: Ping timeout duration (milliseconds)
- `size`: Size of ping packets
- `wait`: Wait time between ping sequences
- `max_store_logs`: Maximum number of historical ping logs to retain
- `max_concurrent_probes`: Maximum number of concurrent ping operations
- `skip_cidr_first_addr`: Skip first address in CIDR ranges
- `skip_cidr_last_addr`: Skip last address in CIDR ranges

## API Endpoints

- `GET /`: Web interface
- `POST /api/ping`: Start pinging specified hosts
- `GET /api/results`: Get current ping results
- `DELETE /api/results`: Clear all ping results

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache 2.0 License - see the LICENSE file for details.