package model

type ExportPDFRequest struct {
	HTML     string `json:"html" binding:"required"`
	Filename string `json:"filename"`
}
