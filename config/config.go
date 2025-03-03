package config

type ProbeConfig struct {
	Interval            int  `json:"interval" mapstructure:"interval"`
	Count               int  `json:"count" mapstructure:"count"`
	Timeout             int  `json:"timeout" mapstructure:"timeout"`
	Size                int  `json:"size" mapstructure:"size"`
	Wait                int  `json:"wait" mapstructure:"wait"`
	MaxStoreLogs        int  `json:"max_store_logs" mapstructure:"max_store_logs"`
	MaxConcurrentProbes int  `json:"max_concurrent_probes" mapstructure:"max_concurrent_probes"`
	SkipCidrFirstAddr   bool `json:"skip_cidr_first_addr" mapstructure:"skip_cidr_first_addr"`
	SkipCidrLastAddr    bool `json:"skip_cidr_last_addr" mapstructure:"skip_cidr_last_addr"`
}

var Config *ProbeConfig

func Init() *ProbeConfig {
	// Initialize with sensible default values
	var settings = ProbeConfig{
		Interval:            1000,  // 1000 microseconds (1ms) between pings
		Count:               4,     // Number of pings per probe
		Timeout:             2,     // 2 seconds timeout
		Size:                56,    // Standard ICMP echo size
		Wait:                1,     // 1 second wait between probe sets
		MaxStoreLogs:        100,   // Maximum number of logs to store
		MaxConcurrentProbes: 100,   // Maximum concurrent pings
		SkipCidrFirstAddr:   true, // Don't skip first address in CIDR range
		SkipCidrLastAddr:    true, // Don't skip last address in CIDR range
	}
	Config = &settings
	return Config
}
