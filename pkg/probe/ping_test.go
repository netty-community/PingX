package probe

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"testing"
	"time"

	probing "github.com/prometheus-community/pro-bing"
	"github.com/stretchr/testify/assert"
)

func TestNewPingManager(t *testing.T) {
	pm := NewPingManager()
	assert.NotNil(t, pm)
	assert.NotNil(t, pm.results)
	assert.False(t, pm.running)
}

func TestPingManager_StartPinging(t *testing.T) {
	pm := NewPingManager()
	hosts := []string{"localhost", "127.0.0.1"}

	// Test starting ping
	pm.StartPinging(hosts)
	assert.True(t, pm.running)
	assert.NotNil(t, pm.done)

	// Verify results are initialized
	pm.mu.Lock()
	assert.Equal(t, len(hosts), len(pm.results))
	for _, host := range hosts {
		result, exists := pm.results[host]
		assert.True(t, exists)
		assert.Equal(t, host, result.Hostname)
		assert.NotZero(t, result.StartTime)
		assert.NotNil(t, result.PingLogs)
	}
	pm.mu.Unlock()

	// Test starting when already running
	pm.StartPinging(hosts)
	assert.True(t, pm.running)

	// Cleanup
	pm.StopPinging()
}

func TestPingManager_StopPinging(t *testing.T) {
	pm := NewPingManager()
	hosts := []string{"localhost"}

	// Start and immediately stop
	pm.StartPinging(hosts)
	assert.True(t, pm.running)

	pm.StopPinging()
	assert.False(t, pm.running)
	assert.Nil(t, pm.done)

	// Test stopping when not running
	pm.StopPinging()
	assert.False(t, pm.running)
}

func TestPingManager_GetResults(t *testing.T) {
	pm := NewPingManager()

	// Test empty results
	results := pm.GetResults()
	assert.Empty(t, results)

	// Add some test results
	pm.mu.Lock()
	now := time.Now().Format(time.RFC3339)
	pm.results = map[string]*PingResult{
		"localhost": {
			Hostname:     "localhost",
			IPAddr:       "8.8.8.8",
			StartTime:    now,
			TotalCount:   10,
			SuccessCount: 8,
			FailureCount: 2,
			MinLatency:   time.Millisecond,
			MaxLatency:   time.Millisecond * 5,
			AvgLatency:   time.Millisecond * 3,
			PingLogs:     make([]*PingLog, 0),
		},
	}
	pm.mu.Unlock()

	// Test getting results
	results = pm.GetResults()
	for _, result := range results {
		log.Printf("%+v", result)
	}
	// assert.Equal(t, 1, len(results))
	// assert.Equal(t, "localhost", results[0].Hostname)
	// assert.Equal(t, "127.0.0.1", results[0].IPAddr)
	// assert.Equal(t, int64(10), results[0].TotalCount)
	// assert.Equal(t, int64(8), results[0].SuccessCount)
	// assert.Equal(t, int64(2), results[0].FailureCount)
}

func TestPingManager_GetHostHistory(t *testing.T) {
	pm := NewPingManager()
	hostname := "localhost"

	// Test getting history for non-existent host
	history := pm.GetHostHistory(hostname)
	assert.Nil(t, history)

	// Add test history
	pm.mu.Lock()
	now := time.Now().Format(time.RFC3339)
	pm.results = map[string]*PingResult{
		hostname: {
			Hostname:  hostname,
			IPAddr:    "127.0.0.1",
			StartTime: now,
			PingLogs:  make([]*PingLog, 0),
		},
	}
	pm.mu.Unlock()

	// Test getting history for existing host
	history = pm.GetHostHistory(hostname)
	assert.NotNil(t, history)
	assert.Equal(t, hostname, history.Hostname)
	assert.Equal(t, "127.0.0.1", history.IPAddr)
	assert.Equal(t, now, history.StartTime)
}

func TestPingManager_Concurrency(t *testing.T) {
	pm := NewPingManager()
	hosts := []string{"localhost", "127.0.0.1"}
	var wg sync.WaitGroup

	// Start pinging
	pm.StartPinging(hosts)

	// Test concurrent access to results
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			results := pm.GetResults()
			assert.NotNil(t, results)
		}()
		go func() {
			defer wg.Done()
			history := pm.GetHostHistory("localhost")
			if history != nil {
				assert.Equal(t, "localhost", history.Hostname)
			}
		}()
	}

	wg.Wait()
	pm.StopPinging()
}

func TestPingManager_icmpPing(t *testing.T) {
	pinger, err := probing.NewPinger("www.google.com")
	if err != nil {
		panic(err)
	}

	// Listen for Ctrl-C.
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	go func() {
		for _ = range c {
			pinger.Stop()
		}
	}()

	pinger.OnRecv = func(pkt *probing.Packet) {
		fmt.Printf("%d bytes from %s: icmp_seq=%d time=%v\n",
			pkt.Nbytes, pkt.IPAddr, pkt.Seq, pkt.Rtt)
	}

	pinger.OnDuplicateRecv = func(pkt *probing.Packet) {
		fmt.Printf("%d bytes from %s: icmp_seq=%d time=%v ttl=%v (DUP!)\n",
			pkt.Nbytes, pkt.IPAddr, pkt.Seq, pkt.Rtt, pkt.TTL)
	}

	pinger.OnFinish = func(stats *probing.Statistics) {
		fmt.Printf("\n--- %s ping statistics ---\n", stats.Addr)
		fmt.Printf("%d packets transmitted, %d packets received, %v%% packet loss\n",
			stats.PacketsSent, stats.PacketsRecv, stats.PacketLoss)
		fmt.Printf("round-trip min/avg/max/stddev = %v/%v/%v/%v\n",
			stats.MinRtt, stats.AvgRtt, stats.MaxRtt, stats.StdDevRtt)
	}

	fmt.Printf("PING %s (%s):\n", pinger.Addr(), pinger.IPAddr())
	err = pinger.Run()
	if err != nil {
		panic(err)
	}
}
