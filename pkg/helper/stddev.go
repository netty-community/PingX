package helper

import (
	"math"
	"time"
)

func CalculateStandardDeviation(data []time.Duration) float64 {
	if len(data) == 0 {
		return 0 // 如果数据为空，返回0
	}

	// 计算平均值
	var sum float64
	for _, value := range data {
		sum += float64(value.Nanoseconds())
	}
	mean := sum / float64(len(data))

	// 计算方差
	var varianceSum float64
	for _, value := range data {
		varianceSum += math.Pow(float64(value.Nanoseconds())-mean, 2)
	}
	variance := varianceSum / float64(len(data))

	// 返回标准差
	return math.Sqrt(variance)
}
