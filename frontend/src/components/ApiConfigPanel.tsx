import React, { useState } from "react";
import { Settings2, X } from "lucide-react";

interface ApiConfigPanelProps {
  apiUrl: string;
  onApiUrlChange: (url: string) => void;
}

export const ApiConfigPanel: React.FC<ApiConfigPanelProps> = ({ apiUrl, onApiUrlChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(apiUrl);

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <Settings2 className="h-4 w-4 text-teal" />
        <span className="text-sm font-medium text-foreground">API-эндпоинт</span>
      </div>

      {editing ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://your-api.example.com/predict"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/40 font-mono"
            autoFocus
          />
          <button
            onClick={() => { onApiUrlChange(draft); setEditing(false); }}
            className="rounded-md bg-teal px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-teal-glow transition-colors"
          >
            Сохранить
          </button>
          <button
            onClick={() => { setDraft(apiUrl); setEditing(false); }}
            className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-muted-foreground truncate bg-background border border-border rounded px-2 py-1.5">
            {apiUrl || "не задан"}
          </code>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-teal hover:text-teal-glow transition-colors"
          >
            Изменить
          </button>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Отправка: `POST multipart/form-data` с ключом <code className="text-teal">file</code>. Ожидаемый
        JSON-ответ:{" "}
        <code className="text-teal">{"{ probabilities: number[] }"}</code>
      </p>
    </div>
  );
};
