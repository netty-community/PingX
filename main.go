package main

import (
	"embed"
	"html/template"
	"io/fs"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/netty-community/pingx/config"
	"github.com/netty-community/pingx/pkg/probe"
)

type PingRequest struct {
	Hosts []string `json:"hosts" binding:"required"`
}

var pingManager *probe.PingManager

//go:embed templates/*
var templatesFS embed.FS

//go:embed static/*
var staticFS embed.FS

func main() {
	// Initialize default configuration
	config.Init()

	// Initialize ping manager
	pingManager = probe.NewPingManager()

	router := gin.Default()

	// Enable CORS
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "DELETE"},
		AllowHeaders:     []string{"Origin", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Serve static files
	tmpl := template.Must(template.New("").ParseFS(templatesFS, "templates/*"))
	router.SetHTMLTemplate(tmpl)
	static, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(err)
	}
	router.StaticFS("/static", http.FS(static))

	// Serve the main page
	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "PingX - Real-time Batch Ping Tool",
		})
	})

	// Configuration endpoints
	router.POST("/api/ping/config", func(c *gin.Context) {
		if err := c.ShouldBindJSON(&config.Config); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, config.Config)
	})

	router.GET("/api/ping/config", func(c *gin.Context) {
		c.JSON(http.StatusOK, config.Config)
	})

	// Ping endpoints
	router.POST("/api/ping/start", func(c *gin.Context) {
		var req PingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		pingManager.StartPinging(req.Hosts)
		c.JSON(http.StatusOK, gin.H{"message": "Ping started"})
	})

	router.POST("/api/ping/stop", func(c *gin.Context) {
		pingManager.StopPinging()
		c.JSON(http.StatusOK, gin.H{"message": "Ping stopped"})
	})

	router.POST("/api/ping/clear", func(c *gin.Context) {
		pingManager.StopPinging()
		pingManager.ClearResults()
		c.JSON(http.StatusOK, gin.H{"message": "Ping stopped and history cleared"})
	})

	router.GET("/api/ping/results", func(c *gin.Context) {
		results := pingManager.GetResults()
		c.JSON(http.StatusOK, results)
	})

	router.GET("/api/ping/history/:hostname", func(c *gin.Context) {
		hostname := c.Param("hostname")
		result := pingManager.GetHostHistory(hostname)
		if result == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Host not found"})
			return
		}
		c.JSON(http.StatusOK, result)
	})

	// Start the server
	router.Run(":8080")
}
