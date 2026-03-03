import { useState, useEffect } from "react";
import { LandingPage } from "@/components/LandingPage";
import { Dashboard } from "@/components/Dashboard";
import type { FileInfo } from "@/lib/mockGenerator";
import { runSelfChecks } from "@/lib/mockGenerator";

type AppState =
  | { view: "landing" }
  | { view: "dashboard"; fileInfo: FileInfo; file: File; apiMode: boolean; apiUrl: string };

const Index = () => {
  const [state, setState] = useState<AppState>({ view: "landing" });

  useEffect(() => {
    runSelfChecks();
  }, []);

  if (state.view === "dashboard") {
    return (
      <Dashboard
        fileInfo={state.fileInfo}
        file={state.file}
        apiMode={state.apiMode}
        apiUrl={state.apiUrl}
        onBack={() => setState({ view: "landing" })}
      />
    );
  }

  return (
    <LandingPage
      onAnalyze={(fileInfo, file, apiMode, apiUrl) =>
        setState({ view: "dashboard", fileInfo, file, apiMode, apiUrl })
      }
    />
  );
};

export default Index;

