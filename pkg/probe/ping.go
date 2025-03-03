package probe

import (
	"fmt"
	"runtime"
	"sync"
	"time"

	"github.com/netty-community/pingx/config"
	"github.com/netty-community/pingx/pkg/helper"
	probing "github.com/prometheus-community/pro-bing"
)

// PingResult represents the result of ping operations for a single target
type PingResult struct {
	Hostname       string
	IPAddr         string
	StartTime      string
	TotalCount     int
	SuccessCount   int
	FailureCount   int
	FailurePercent float64
	LastPingFailed bool
	MinLatency     time.Duration
	MaxLatency     time.Duration
	AvgLatency     time.Duration
	StdDevLatency  float64
	rtts           []time.Duration
	PingLogs       []*PingLog
}

// PingLog represents a single ping operation result with timestamp
type PingLog struct {
	Timestamp string
	*probing.Statistics
}

// PingManager manages ping operations and maintains history
type PingManager struct {
	mu      sync.RWMutex
	results map[string]*PingResult
	done    chan struct{}
	running bool
}

// NewPingManager creates a new PingManager instance
func NewPingManager() *PingManager {
	return &PingManager{
		results: make(map[string]*PingResult),
		done:    make(chan struct{}),
	}
}

// StartPinging starts continuous ping operations for the given hosts
func (pm *PingManager) StartPinging(hosts []string) {
	pm.mu.Lock()
	if pm.running {
		pm.mu.Unlock()
		return
	}
	pm.running = true
	pm.done = make(chan struct{})

	// Initialize results for new hosts
	now := time.Now().Format(time.RFC3339)
	for _, host := range hosts {
		if _, exists := pm.results[host]; !exists {
			pm.results[host] = &PingResult{
				Hostname:  host,
				StartTime: now,
				PingLogs:  make([]*PingLog, 0),
			}
		}
	}
	pm.mu.Unlock()

	go pm.pingLoop(hosts)
}

// StopPinging stops all ping operations
func (pm *PingManager) StopPinging() {
	pm.mu.Lock()
	if !pm.running {
		pm.mu.Unlock()
		return
	}
	pm.running = false
	close(pm.done)
	pm.mu.Unlock()
}

// GetResults returns current results for all hosts
func (pm *PingManager) GetResults() []*PingResult {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	results := make([]*PingResult, 0, len(pm.results))
	for _, result := range pm.results {
		results = append(results, result)
	}
	return results
}

// GetHostHistory returns the ping history for a specific host
func (pm *PingManager) GetHostHistory(hostname string) *PingResult {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	if result, exists := pm.results[hostname]; exists {
		return result
	}
	return nil
}

// ClearResults stops pinging and clears all ping results
func (pm *PingManager) ClearResults() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// Clear all results
	pm.results = make(map[string]*PingResult)
}

// pingLoop continuously pings hosts until stopped
func (pm *PingManager) pingLoop(hosts []string) {
	ticker := time.NewTicker(time.Duration(config.Config.Interval) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-pm.done:
			return
		case <-ticker.C:
			stats := pm.concurrentPing(hosts)

			pm.mu.Lock()
			for hostname, stat := range stats {
				if result, exists := pm.results[hostname]; exists {
					result = pm.handlePingResult(hostname, stat, result)
					pm.results[hostname] = result
				}
			}
			pm.mu.Unlock()
		}
	}
}

func (pm *PingManager) handlePingResult(hostname string, stats *probing.Statistics, result *PingResult) *PingResult {
	if stats == nil {
		result.LastPingFailed = true
		result.FailureCount++
		return result
	}
	result.Hostname = hostname
	result.IPAddr = stats.IPAddr.String()
	result.TotalCount++
	if stats.PacketLoss > 0 {
		result.FailureCount++
		result.LastPingFailed = true
	} else {
		result.SuccessCount++
		result.LastPingFailed = false
	}

	result.FailurePercent = float64(result.FailureCount) / float64(result.TotalCount) * 100
	result.MinLatency = pm.minLatency(stats.MinRtt, result.MinLatency)
	result.MaxLatency = pm.maxLatency(stats.MaxRtt, result.MaxLatency)
	result.AvgLatency = stats.AvgRtt
	result.rtts = append(result.rtts, stats.Rtts...)
	result.StdDevLatency = helper.CalculateStandardDeviation(result.rtts)

	// Keep the last N ping logs (e.g., last 100 pings)
	maxLogs := config.Config.MaxStoreLogs
	now := time.Now().Format(time.RFC3339)
	result.PingLogs = append(result.PingLogs, &PingLog{Timestamp: now, Statistics: stats})
	if len(result.PingLogs) > maxLogs {
		result.PingLogs = result.PingLogs[len(result.PingLogs)-maxLogs:]
	}
	return result
}

func (pm *PingManager) concurrentPing(ipAddrs []string) map[string]*probing.Statistics {
	results := make(map[string]*probing.Statistics)
	var mu sync.Mutex

	// Create buffered channels for work distribution
	jobs := make(chan string, len(ipAddrs))
	results_ch := make(chan struct {
		hostname string
		stats    *probing.Statistics
	}, len(ipAddrs))

	// Determine number of workers
	numWorkers := config.Config.MaxConcurrentProbes
	if numWorkers > len(ipAddrs) {
		numWorkers = len(ipAddrs)
	}

	// Start workers
	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for hostname := range jobs {
				stats, err := pm.icmpPing(hostname)
				if err != nil {
					fmt.Printf("Error pinging %s: %v\n", hostname, err)
					continue
				}
				results_ch <- struct {
					hostname string
					stats    *probing.Statistics
				}{hostname, stats}
			}
		}()
	}

	// Send jobs to workers
	for _, hostname := range ipAddrs {
		jobs <- hostname
	}
	close(jobs)

	// Start a goroutine to close results channel after all workers are done
	go func() {
		wg.Wait()
		close(results_ch)
	}()

	// Collect results
	for result := range results_ch {
		mu.Lock()
		results[result.hostname] = result.stats
		mu.Unlock()
	}

	return results
}

func (pm *PingManager) icmpPing(ip string) (*probing.Statistics, error) {
	pinger, err := probing.NewPinger(ip)
	if err != nil {
		return nil, err
	}
	pinger.Count = config.Config.Count
	pinger.Timeout = time.Duration(config.Config.Timeout) * time.Second
	pinger.Interval = time.Duration(config.Config.Interval) * time.Microsecond
	pinger.Size = config.Config.Size
	if runtime.GOOS == "windows" {
		pinger.SetPrivileged(true)
	}

	err = pinger.Run()
	if err != nil {
		return nil, err
	}
	return pinger.Statistics(), nil
}

func (pm *PingManager) minLatency(current time.Duration, previous time.Duration) time.Duration {
	if previous == 0 || (current > 0 && current < previous) {
		return current
	}
	return previous
}

func (pm *PingManager) maxLatency(current time.Duration, previous time.Duration) time.Duration {
	if current > previous {
		return current
	}
	return previous
}
