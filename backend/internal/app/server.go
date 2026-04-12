package app

import (
	"net/http"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/handler"
	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/router"
	"resumecraft-pdf-backend/internal/service/pdf"

	"github.com/gin-gonic/gin"
)

func NewServer() *http.Server {
	cfg := config.Load()

	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(middleware.CORS())

	pdfService := pdf.NewService(cfg.PDF)
	h := handler.New(pdfService)
	router.Register(engine, h, cfg.Server.FrontendDistDir)

	return &http.Server{
		Addr:              ":" + cfg.Server.Port,
		Handler:           engine,
		ReadHeaderTimeout: cfg.Server.ReadHeaderTimeout,
		ReadTimeout:       cfg.Server.ReadTimeout,
		WriteTimeout:      cfg.Server.WriteTimeout,
	}
}
