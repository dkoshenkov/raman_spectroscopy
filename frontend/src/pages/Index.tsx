import { useEffect, useRef, useState } from "react";
import { LandingPage } from "@/components/LandingPage";
import { Dashboard } from "@/components/Dashboard";
import type { FileInfo } from "@/lib/mockGenerator";
import { runSelfChecks } from "@/lib/mockGenerator";

type AppState =
  | { view: "landing" }
  | { view: "dashboard"; fileInfo: FileInfo; file: File };

type IndexHistoryState =
  | { __deeppick: true; view: "landing"; slot: "base" | "guard" }
  | { __deeppick: true; view: "dashboard" };

const Index = () => {
  const [state, setState] = useState<AppState>({ view: "landing" });
  const lastDashboardStateRef = useRef<Extract<AppState, { view: "dashboard" }> | null>(null);
  const historyInitializedRef = useRef(false);

  const replaceLandingBaseEntry = () => {
    const nextState: IndexHistoryState = { __deeppick: true, view: "landing", slot: "base" };
    window.history.replaceState(nextState, "", window.location.href);
  };

  const pushLandingGuardEntry = () => {
    const nextState: IndexHistoryState = { __deeppick: true, view: "landing", slot: "guard" };
    window.history.pushState(nextState, "", window.location.href);
  };

  useEffect(() => {
    runSelfChecks();
  }, []);

  useEffect(() => {
    if (historyInitializedRef.current) {
      return;
    }

    historyInitializedRef.current = true;
    replaceLandingBaseEntry();
    pushLandingGuardEntry();

    const handlePopState = (event: PopStateEvent) => {
      const historyState = event.state as IndexHistoryState | null;

      if (!historyState?.__deeppick) {
        setState({ view: "landing" });
        replaceLandingBaseEntry();
        pushLandingGuardEntry();
        return;
      }

      if (historyState.view === "dashboard") {
        if (lastDashboardStateRef.current) {
          setState(lastDashboardStateRef.current);
          return;
        }

        setState({ view: "landing" });
        replaceLandingBaseEntry();
        pushLandingGuardEntry();
        return;
      }

      setState({ view: "landing" });

      if (historyState.slot === "base") {
        pushLandingGuardEntry();
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleAnalyze = (fileInfo: FileInfo, file: File) => {
    const nextState: Extract<AppState, { view: "dashboard" }> = { view: "dashboard", fileInfo, file };

    lastDashboardStateRef.current = nextState;
    setState(nextState);
    window.history.pushState({ __deeppick: true, view: "dashboard" } satisfies IndexHistoryState, "", window.location.href);
  };

  const handleDashboardBack = () => {
    window.history.back();
  };

  if (state.view === "dashboard") {
    return (
      <Dashboard
        fileInfo={state.fileInfo}
        file={state.file}
        onBack={handleDashboardBack}
      />
    );
  }

  return (
    <LandingPage
      onAnalyze={handleAnalyze}
    />
  );
};

export default Index;
