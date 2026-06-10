package export

import "resumecraft-pdf-backend/internal/model"

type Renderer interface {
	Render(resume *model.ResumeDetail) ([]byte, string, error)
}

type RendererFactory struct {
	pdfService PDFRenderer
	renderers  map[string]Renderer
}

type PDFRenderer interface {
	RenderHTML(html string) ([]byte, error)
}

func NewRendererFactory(pdfService PDFRenderer) *RendererFactory {
	f := &RendererFactory{
		pdfService: pdfService,
		renderers:  make(map[string]Renderer),
	}
	f.renderers["markdown"] = &MarkdownRenderer{}
	f.renderers["json"] = &JSONRenderer{}
	return f
}

func (f *RendererFactory) Get(format string) Renderer {
	if r, ok := f.renderers[format]; ok {
		return r
	}
	return nil
}

func (f *RendererFactory) Supports(format string) bool {
	_, ok := f.renderers[format]
	return ok || format == "pdf"
}
