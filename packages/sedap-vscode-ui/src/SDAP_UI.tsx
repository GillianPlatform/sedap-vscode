import React, { useEffect } from "react";
import useStore from "./store";
import * as events from "./events";
import Loading from "./util/Loading";
import DebuggerPanel from "./DebuggerPanel/DebuggerPanel";
import VSCodeAPI, { requestUnification } from "./VSCodeAPI";
import "./vscode.css";

import "./style.css";

const SDAP_UI = () => {
  useEffect(() => {
    VSCodeAPI.onMessage((e) => {
      const message = e.data;
      const store = useStore.getState();

      if (message.type === "state_update") {
        const { state } = message;
        store.updateDebuggerState(state);
        const currentProcState = state.procs[state.currentProc];
        const { unifys } = currentProcState;

        if (unifys.length > 0) {
          const unifyId = unifys[0].id;
          const isInStore = store.selectBaseUnification(unifyId);

          if (!isInStore) {
            requestUnification(unifyId);
          }
        } else {
          store.clearUnification();
        }
      }

      if (message.type === "unify_update") {
        store.loadUnification(message.unifyId, message.unifyMap);
      } else if (message.type === "reset_view") {
        events.publish("resetView");
      }
    });
  });

  const { debuggerState } = useStore();

  const refresh = () => {
    VSCodeAPI.postMessage({ type: "request_state_update" });
  };

  const content =
    debuggerState === undefined ? (
      <Loading {...{ refresh }} />
    ) : (
      <DebuggerPanel />
    );

  return (
    <div style={{ margin: "10px", boxSizing: "border-box" }}>{content}</div>
  );
};

export default SDAP_UI;
