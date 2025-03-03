let pingInterval;
const REFRESH_INTERVAL = 2000; // 2 seconds
let selectedHostname = null;
let pingChart = null;
let currentSort = {
    column: 'hostname',
    direction: 'asc'
};

function startPing() {
    const hostsText = document.getElementById('hosts-input').value;
    let hosts = hostsText.split('\n')
        .map(host => host.trim())
        .filter(host => host !== '');
    
    if (hosts.length === 0) {
        showAlert('Please enter at least one host', 'danger');
        return;
    }

    // Validate each host
    const invalidHosts = hosts.filter(host => !isValidHost(host));
    if (invalidHosts.length > 0) {
        showAlert(`Invalid host(s): ${invalidHosts.join(', ')}. Please enter valid IPv4, IPv6, or domain names.`, 'danger');
        return;
    }
    const form = document.getElementById('pingOptionsForm');
    const skipFirst = form.skip_cidr_first_addr.checked;
    const skipLast = form.skip_cidr_last_addr.checked;

    // Convert CIDR addresses to IP list
    hosts = hosts.flatMap(host => 
        isValidIPv4Network(host) ? cidrToIPList(host, skipFirst, skipLast) : host
    );
    

    togglePingState(true);
    showAlert('Starting ping monitoring...', 'info');

    // Start the ping operation
    fetch('/api/ping/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hosts: hosts })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(() => {
        // Start polling for results
        pingInterval = setInterval(fetchResults, REFRESH_INTERVAL);
        // Fetch results immediately
        fetchResults();
    })
    .catch(handleError);
}

function stopPing() {
    fetch('/api/ping/stop', {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(() => {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        togglePingState(false);
        showAlert('Ping monitoring stopped', 'warning');
    })
    .catch(handleError);
}

function clearPing() {
    fetch('/api/ping/clear', {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(() => {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        togglePingState(false);
        
        // Clear the results table
        const tbody = document.getElementById('resultsTable');
        while (tbody.firstChild) {
            tbody.removeChild(tbody.firstChild);
        }
        
        // Clear the chart
        if (pingChart) {
            pingChart.data.labels = [];
            pingChart.data.datasets[0].data = [];
            pingChart.update();
        }
        
        // Hide details section if visible
        hideDetails();
        
        showAlert('Ping monitoring stopped and history cleared', 'warning');
    })
    .catch(handleError);
}

function fetchResults() {
    fetch('/api/ping/results')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(results => {
        console.log('Fetched results:', results);
        updateResults(results);
        if (selectedHostname) {
            console.log('Selected hostname:', selectedHostname);
            const selectedResult = results.find(r => r.Hostname === selectedHostname);
            if (selectedResult) {
                console.log('Found selected result:', selectedResult);
                updateDetails(selectedResult);
                updateChartData(selectedResult);
            } else {
                console.warn('Selected hostname not found in results');
            }
        }
    })
    .catch(handleError);
}

function showDetails(hostname) {
    console.log('showDetails called for hostname:', hostname);
    selectedHostname = hostname;
    
    fetch(`/api/ping/history/${encodeURIComponent(hostname)}`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        console.log('Received ping history:', result);
        updateDetails(result);
        updateChartData(result);
    })
    .catch(error => {
        console.error('Error in showDetails:', error);
        handleError(error);
    });
}

function hideDetails() {
    selectedHostname = null;
    document.getElementById('detailsSection').style.display = 'none';
    
    // Clear chart data
    if (pingChart) {
        pingChart.data.labels = [];
        pingChart.data.datasets[0].data = [];
        pingChart.update();
    }
}

function updateDetails(result) {
    const detailsSection = document.getElementById('detailsSection');
    detailsSection.style.display = 'block';

    // Update header information
    document.getElementById('detailsHostname').textContent = result.Hostname;
    document.getElementById('detailsIPAddress').textContent = result.IPAddr;
    const startTime = result.StartTime ? new Date(result.StartTime).toLocaleString() : 'N/A';
    document.getElementById('detailsStartTime').textContent = startTime;

    // Calculate and update statistics
    const successRate = ((result.SuccessCount / result.TotalCount) * 100).toFixed(1);
    const packetLoss = ((result.FailureCount / result.TotalCount) * 100).toFixed(1);
    
    document.getElementById('detailsSuccessRate').textContent = `${successRate}%`;
    document.getElementById('detailsAvgLatency').textContent = formatDuration(result.AvgLatency);
    document.getElementById('detailsPacketLoss').textContent = `${packetLoss}%`;
    document.getElementById('detailsStdDevLatency').textContent = formatDuration(result.StdDevLatency);
}

function updateChartData(result) {
    console.log('updateChartData called with result:', result);
    
    if (!pingChart) {
        console.error('Chart not initialized!');
        return;
    }

    // Check if result has the expected structure
    if (!result || !Array.isArray(result.PingLogs)) {
        console.error('Invalid result structure:', result);
        return;
    }

    const newLogs = result.PingLogs;
    console.log('Processing ping logs, count:', newLogs.length);
    
    const labels = [];
    const avgLatency = [];

    newLogs.forEach((log, index) => {
        console.log(`Processing log ${index}:`, log);                
        const timestamp = new Date(log.Timestamp).toLocaleTimeString();
        const latency = log.AvgRtt ? (log.AvgRtt / 1000000) : 0;
        
        console.log(`Adding data point - Time: ${timestamp}, Latency: ${latency}ms`);
        
        labels.push(timestamp);
        avgLatency.push(latency);
    });

    console.log('Final chart data:', {
        labels: labels,
        avgLatency: avgLatency
    });

    try {
        // Update chart data
        pingChart.data.labels = labels;
        pingChart.data.datasets[0].data = avgLatency;
        
        // Force immediate update
        pingChart.update('none');
        console.log('Chart update completed');
        
        // Verify chart data after update
        console.log('Chart data after update:', {
            labels: pingChart.data.labels,
            data: pingChart.data.datasets[0].data
        });
    } catch (error) {
        console.error('Error updating chart:', error);
    }
}

function handleError(error) {
    console.error('Error:', error);
    showAlert('Error: ' + error.message, 'danger');
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
        togglePingState(false);
    }
}

function togglePingState(isRunning) {
    const startBtn = document.getElementById('startPing');
    const stopBtn = document.getElementById('stopPing');
    const clearBtn = document.getElementById('clearPing');
    const refreshStatus = document.getElementById('refreshStatus');
    
    startBtn.disabled = isRunning;
    stopBtn.disabled = !isRunning;
    clearBtn.disabled = !isRunning;
    
    if (isRunning) {
        refreshStatus.className = 'status status-green';
        refreshStatus.innerHTML = '<span class="status-dot status-dot-animated"></span>Live Updates';
    } else {
        refreshStatus.className = 'status status-red';
        refreshStatus.innerHTML = '<span class="status-dot"></span>Stopped';
    }
}

function sortResults(results) {
    return [...results].sort((a, b) => {
        let aVal, bVal;
        
        switch (currentSort.column) {
            case 'hostname':
                aVal = a.Hostname || '';
                bVal = b.Hostname || '';
                break;
            case 'ipaddr':
                aVal = a.IPAddr || '';
                bVal = b.IPAddr || '';
                break;
            case 'success':
                aVal = (a.SuccessCount / a.TotalCount) || 0;
                bVal = (b.SuccessCount / b.TotalCount) || 0;
                break;
            case 'status':
                aVal = a.LastPingFailed ? 1 : 0;
                bVal = b.LastPingFailed ? 1 : 0;
                break;
            case 'avg':
                aVal = a.AvgLatency || 0;
                bVal = b.AvgLatency || 0;
                break;
            case 'max':
                aVal = a.MaxLatency || 0;
                bVal = b.MaxLatency || 0;
                break;
            case 'stddev':
                aVal = a.StdDevLatency || 0;
                bVal = b.StdDevLatency || 0;
                break;
            default:
                return 0;
        }

        // Handle string comparison
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }

        if (aVal === bVal) return 0;
        
        const comparison = aVal > bVal ? 1 : -1;
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });
}

function updateSortIndicators() {
    // Remove all sort classes
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc', 'sort-active');
    });
    
    // Add sort class to current column
    const currentHeader = document.querySelector(`th[data-sort="${currentSort.column}"]`);
    if (currentHeader) {
        currentHeader.classList.add(`sort-${currentSort.direction}`, 'sort-active');
    }
}

function handleSort(column) {
    if (currentSort.column === column) {
        // Toggle direction if same column
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to ascending
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    
    updateSortIndicators();
    
    // Re-render the current results with new sort
    const results = fetchResults();
    updateResults(results);
}

function updateResults(results) {
    const tbody = document.getElementById('resultsTable');
    
    // Clear existing rows while preserving references
    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }
    
    // Sort results before rendering
    const sortedResults = sortResults(results);
    
    sortedResults.forEach(result => {
        const row = document.createElement('tr');
        const hostname = result.Hostname || 'Unknown Host';
        const successRate = ((result.SuccessCount / result.TotalCount) * 100).toFixed(1);
        
        row.innerHTML = `
            <td>${hostname}</td>
            <td class="text-muted">${result.IPAddr || 'Resolving...'}</td>
            <td>
                <div class="clearfix">
                    <div class="float-start me-3">
                        ${result.SuccessCount}/${result.TotalCount}
                    </div>
                    <div class="float-end">
                        <span class="text-muted">${successRate}%</span>
                    </div>
                </div>
                <div class="progress progress-sm">
                    <div class="progress-bar ${result.LastPingFailed ? 'bg-danger' : 'bg-success'}" 
                         style="width: ${successRate}%" role="progressbar" 
                         aria-valuenow="${successRate}" aria-valuemin="0" aria-valuemax="100">
                    </div>
                </div>
            </td>
            <td>
                <span class="status ${result.LastPingFailed ? 'status-red' : 'status-green'}">
                    ${result.LastPingFailed ? 'Failed' : 'Success'}
                </span>
            </td>
            <td>${formatDuration(result.AvgLatency)}</td>
            <td>${formatDuration(result.MaxLatency)}</td>
            <td>${formatDuration(result.StdDevLatency)}</td>
            <td>
                <button class="btn btn-sm" onclick="showDetails('${hostname}')">
                    <i class="ti ti-chart-line"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatDuration(ns) {
    if (!ns) return 'N/A';
    return (ns / 1000000).toFixed(2) + 'ms';
}

function showAlert(message, type = 'success') {
    const alertStyles = {
        success: {
            background: '#d1e7dd',
            color: '#0a3622',
            fontSize: '1rem'
        },
        warning: {
            background: '#fff3cd',
            color: '#664d03',
            fontSize: '1.1rem',
            fontWeight: '500'
        },
        danger: {
            background: '#f8d7da',
            color: '#842029',
            fontSize: '1.1rem',
            fontWeight: '500',
            borderLeft: '5px solid #842029'
        },
        info: {
            background: '#cff4fc',
            color: '#055160',
            fontSize: '1rem'
        }
    };

    const style = alertStyles[type];
    const styleString = Object.entries(style)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');

    const alertHTML = `
        <div class="alert alert-${type} alert-dismissible" role="alert" 
             style="padding: 1rem 1.5rem; ${styleString}; box-shadow: 0 2px 4px rgba(0,0,0,0.1)">
            <div class="d-flex align-items-center">
                <div style="flex-grow: 1">
                    ${type === 'danger' || type === 'warning' ? 
                      `<strong style="margin-right: 0.5rem">⚠️</strong>` : ''}
                    ${message}
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"
                        style="font-size: 1.2rem; padding: 1rem 1rem"></button>
            </div>
        </div>
    `;
    
    let alertContainer = document.querySelector('.alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.className = 'alert-container container-xl my-3';
        alertContainer.style.position = 'fixed';
        alertContainer.style.top = '20px';
        alertContainer.style.left = '50%';
        alertContainer.style.transform = 'translateX(-50%)';
        alertContainer.style.zIndex = '1050';
        alertContainer.style.width = '100%';
        alertContainer.style.maxWidth = '600px';
        document.body.appendChild(alertContainer);
    }
    
    alertContainer.insertAdjacentHTML('beforeend', alertHTML);
    
    // Remove alert after 5 seconds for success/info, 8 seconds for warning/danger
    const timeout = (type === 'success' || type === 'info') ? 5000 : 8000;
    setTimeout(() => {
        const alerts = alertContainer.getElementsByClassName('alert');
        if (alerts.length > 0) {
            alerts[0].remove();
        }
    }, timeout);
}

function initChart() {
    console.log('Initializing chart...');
    const ctx = document.getElementById('pingChart');
    if (!ctx) {
        console.error('Canvas element not found!');
        return;
    }

    try {
        pingChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Average Latency (ms)',
                        borderColor: '#2fb344',
                        backgroundColor: '#2fb344',
                        data: [],
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Latency (ms)'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
        console.log('Chart initialized successfully');
    } catch (error) {
        console.error('Error initializing chart:', error);
    }
}

function loadPingOptions() {
    fetch('/api/ping/config')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(config => {
        // Populate form with current config
        const form = document.getElementById('pingOptionsForm');
        form.count.value = config.count || 4;
        form.timeout.value = config.timeout || 2;
        form.size.value = config.size || 56;
        form.wait.value = config.wait || 5;
        form.max_store_logs.value = config.max_store_logs || 100;
        form.max_concurrent_probes.value = config.max_concurrent_probes || 100;
        form.skip_cidr_first_addr.checked = config.skip_cidr_first_addr || true;
        form.skip_cidr_last_addr.checked = config.skip_cidr_last_addr || true;
    })
    .catch(error => {
        console.error('Error loading config:', error);
        showAlert('Error loading ping options: ' + error.message, 'danger');
    });
}

function updatePingOptions(event) {
    event.preventDefault();
    
    const form = event.target;
    const config = {
        count: parseInt(form.count.value),
        timeout: parseInt(form.timeout.value),
        size: parseInt(form.size.value),
        wait: parseInt(form.wait.value),
        max_store_logs: parseInt(form.max_store_logs.value),
        max_concurrent_probes: parseInt(form.max_concurrent_probes.value),
        skip_cidr_first_addr: form.skip_cidr_first_addr.checked,
        skip_cidr_last_addr: form.skip_cidr_last_addr.checked
    };

    fetch('/api/ping/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(() => {
        showAlert('Ping options updated successfully', 'success');
    })
    .catch(error => {
        console.error('Error updating config:', error);
        showAlert('Error updating ping options: ' + error.message, 'danger');
    });
}



document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startPing').addEventListener('click', startPing);
    document.getElementById('stopPing').addEventListener('click', stopPing);
    document.getElementById('clearPing').addEventListener('click', clearPing);
    document.getElementById('pingOptionsForm').addEventListener('submit', updatePingOptions);
    initChart();
    loadPingOptions(); // Load current config when page loads
    
    // Add click handlers for sortable columns
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            handleSort(column);
        });
    });
});


// Host validation functions
function isValidIPv4(ip) {
    return /^(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)$/.test(ip);
}

function isValidIPv6(ip) {
    return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9])?[0-9]))$/.test(ip);
}

function isValidDomain(domain) {
    return /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z]{2,6})+$/.test(domain);
}


function isValidHost(host) {
    return isValidIPv4(host) || isValidIPv6(host) || isValidDomain(host) || isValidIPv4Network(host);
}

function isValidIPv4Network(cidr) {
    if (cidr.includes("/")) {
       const parts = cidr.split("/");
       const ip = parts[0];
       const prefix = parts[1];
       return isValidIPv4(ip) && prefix >= 0 && prefix <= 32;
    }
    return false;
}
function ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long) {
    return [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join('.');
}

function cidrToIPList(cidr, skipFirst = false, skipLast = false) {

    const [ip, mask] = cidr.split('/');
    const ipLong = ipToLong(ip);
    const subnetMask = 0xFFFFFFFF << (32 - mask) >>> 0;

    const networkAddress = ipLong & subnetMask;
    const broadcastAddress = networkAddress | (~subnetMask >>> 0);

    let ipList = [];

    for (let i = networkAddress; i <= broadcastAddress; i++) {
        ipList.push(longToIp(i));
    }

    // 处理跳过第一个IP（网络地址）和最后一个IP（广播地址）
    if (skipFirst && ipList.length > 1) {
        ipList.shift();
    }
    if (skipLast && ipList.length > 1) {
        ipList.pop();
    }

    return ipList;
}