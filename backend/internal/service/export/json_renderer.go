package export

import (
	"encoding/json"
	"time"

	"resumecraft-pdf-backend/internal/model"
)

type JSONRenderer struct{}

type JSONExport struct {
	Version    string     `json:"version"`
	ExportedAt string     `json:"exportedAt"`
	Resume     JSONResume `json:"resume"`
	Meta       JSONMeta   `json:"meta"`
}

type JSONResume struct {
	ID           string                 `json:"id"`
	Title        string                 `json:"title"`
	Personal     map[string]interface{} `json:"personal,omitempty"`
	Summary      string                 `json:"summary,omitempty"`
	Work         []interface{}          `json:"work,omitempty"`
	Education    []interface{}          `json:"education,omitempty"`
	Projects     []interface{}          `json:"projects,omitempty"`
	Skills       interface{}            `json:"skills,omitempty"`
	Certificates []interface{}          `json:"certificates,omitempty"`
	Awards       []interface{}          `json:"awards,omitempty"`
	Languages    []interface{}          `json:"languages,omitempty"`
	Portfolio    []interface{}          `json:"portfolio,omitempty"`
	Custom       []interface{}          `json:"custom,omitempty"`
}

type JSONMeta struct {
	Template   string `json:"template"`
	ThemeColor string `json:"themeColor"`
	VersionID  string `json:"versionId,omitempty"`
}

func (j *JSONRenderer) Render(resume *model.ResumeDetail) ([]byte, string, error) {
	export := JSONExport{
		Version:    "1.0",
		ExportedAt: time.Now().Format(time.RFC3339),
		Resume: JSONResume{
			ID:    resume.ID,
			Title: resume.Title,
		},
		Meta: JSONMeta{
			Template:   resume.Template,
			ThemeColor: resume.ThemeColor,
		},
	}

	for _, mod := range resume.Modules {
		modType, _ := mod["type"].(string)
		data, _ := mod["data"].(map[string]interface{})
		if data == nil {
			data = map[string]interface{}{}
		}

		switch modType {
		case "personal":
			export.Resume.Personal = data
		case "summary":
			if content, ok := data["content"].(string); ok {
				export.Resume.Summary = content
			}
		case "work":
			export.Resume.Work = extractItems(data)
		case "education":
			export.Resume.Education = extractItems(data)
		case "project":
			export.Resume.Projects = extractItems(data)
		case "skills":
			export.Resume.Skills = data
		case "certificates":
			export.Resume.Certificates = extractItems(data)
		case "awards":
			export.Resume.Awards = extractItems(data)
		case "languages":
			export.Resume.Languages = extractItems(data)
		case "portfolio":
			export.Resume.Portfolio = extractItems(data)
		case "custom":
			export.Resume.Custom = extractItems(data)
		}
	}

	bytes, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return nil, "", err
	}

	return bytes, "application/json; charset=utf-8", nil
}

func extractItems(data map[string]interface{}) []interface{} {
	if items, ok := data["items"].([]interface{}); ok {
		return items
	}
	return nil
}
