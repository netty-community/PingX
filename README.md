# PingX

A high-performance, concurrent network monitoring tool built in Go that provides real-time ping statistics and monitoring capabilities.

> Since PingInfoView is not available for macOS, PingX was created as a powerful alternative for macOS users who need a reliable network monitoring tool. It offers similar functionality with additional features like concurrent monitoring trend display, all through a modern web interface.

## Features

- **High Performance**: Concurrent ping operations with configurable concurrency limits
- **Real-time Statistics**: Track min/max/avg latency, packet loss, and standard deviation latency
- **Continuous Monitoring**: Automated periodic ping checks with configurable intervals
- **History Tracking**: Maintains historical ping data with configurable retention
- **Multiple Target Support**: Monitor multiple hosts simultaneously
- **CIDR Support**: Optional first/last address skipping for CIDR ranges
- **Web Interface**: Built-in web UI for real-time monitoring

## Roadmap
- **TCP Ping Support**: Support target TCP port status and latency checking
- **UDP Ping Support**: Support target UDP port status and latency checking

## ScreeShot
![PingX Demo](/docs/demo.png)
![PingX Details](/docs/detail.png)

## Quick Start

### Installation
Download `pingx-macos-amd64.tar.gz` from [Release Pages](https://github.com/netty-community/PingX/releases)
```bash
$ tar -xf pingx-macos-amd64.tar.gz pingx
$ rm pingx-macos-amd64.tar.gz
$ cd pingx
$ ./pingx
```

## Configuration

PingX can be configured through web page `ICMP Options`. Key configuration options include:

- `interval`: Time between ping operations (milliseconds)
- `count`: Number of ping packets to send
- `Timeout`: Ping timeout duration (seconds)
- `Packet Size`: Size of ping packets
- `Wait Interval`: Wait time between ping sequences
- `Max Store Logs`: Maximum number of historical ping logs to retain
- `Max Concurrent Probes`: Maximum number of concurrent ping operations
- `Skip CIDR First Addr`: Skip first address in CIDR ranges
- `Skip CIDR Last Addr`: Skip last address in CIDR ranges

## API Endpoints

- `GET /`: Web interface
- `POST /api/ping`: Start pinging specified hosts
- `GET /api/results`: Get current ping results
- `DELETE /api/results`: Clear all ping results

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache 2.0 License - see the LICENSE file for details.