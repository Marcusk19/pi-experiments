package monitorapi

const APIVersion = "monitor/v1"

type Completeness struct {
	Activity  string `json:"activity"`
	Attention string `json:"attention"`
	Tools     string `json:"tools"`
	Tasks     string `json:"tasks"`
}

type SessionSummary struct {
	MonitorID        string       `json:"monitorId"`
	DisplayName      string       `json:"displayName"`
	Adapter          string       `json:"adapter"`
	Workspace        string       `json:"workspace"`
	State            string       `json:"state"`
	ActivitySummary  string       `json:"activitySummary"`
	ActivitySince    int64        `json:"activitySince"`
	AttentionReasons []string     `json:"attentionReasons"`
	ActiveToolCount  int          `json:"activeToolCount"`
	ActiveTaskState  *string      `json:"activeTaskState,omitempty"`
	Completeness     Completeness `json:"completeness"`
}

type Snapshot struct {
	APIVersion    string           `json:"apiVersion"`
	Revision      int64            `json:"revision"`
	GeneratedAt   int64            `json:"generatedAt"`
	DaemonID      string           `json:"daemonId"`
	StartedAt     int64            `json:"startedAt"`
	TotalSessions int              `json:"totalSessions"`
	Truncated     bool             `json:"truncated"`
	Sessions      []SessionSummary `json:"sessions"`
}

type ToolDetail struct {
	ToolCallID string `json:"toolCallId"`
	ToolName   string `json:"toolName"`
	Status     string `json:"status"`
	StartedAt  int64  `json:"startedAt"`
	EndedAt    *int64 `json:"endedAt,omitempty"`
}

type TaskDetail struct {
	TaskID    string `json:"taskId"`
	Role      string `json:"role"`
	State     string `json:"state"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type TimelineEntry struct {
	Timestamp int64  `json:"timestamp"`
	Category  string `json:"category"`
	Label     string `json:"label,omitempty"`
}

type SessionDetail struct {
	APIVersion       string          `json:"apiVersion"`
	MonitorID        string          `json:"monitorId"`
	DisplayName      string          `json:"displayName"`
	Adapter          string          `json:"adapter"`
	AdapterVersion   string          `json:"adapterVersion"`
	CWD              string          `json:"cwd"`
	Workspace        string          `json:"workspace"`
	State            string          `json:"state"`
	ActivitySummary  string          `json:"activitySummary"`
	StartedAt        int64           `json:"startedAt"`
	LastActivityAt   int64           `json:"lastActivityAt"`
	AttentionReasons []string        `json:"attentionReasons"`
	Tools            []ToolDetail    `json:"tools"`
	Tasks            []TaskDetail    `json:"tasks"`
	Timeline         []TimelineEntry `json:"timeline"`
	Completeness     Completeness    `json:"completeness"`
}

type DiscoveryRecord struct {
	Endpoint   string `json:"endpoint"`
	APIVersion string `json:"apiVersion"`
	DaemonID   string `json:"daemonId"`
	StartedAt  int64  `json:"startedAt"`
	Capability string `json:"capability"`
}
