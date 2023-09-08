import * as vscode from "vscode";
import type {
  DebuggerState,
  MessageFromWebview,
  MessageToWebview,
  UnifyMap,
  BranchCase,
} from "@sedap/types";

type LogEvent = {
  msg: string;
  json: any;
};

let sessionCount = 0;
const sessions: Record<number, SEDAPSession> = {};

function withMatchingSession(
  debugSession: vscode.DebugSession,
  callback: (session: SEDAPSession) => any
) {
  Object.values(sessions).forEach((sedapSession) => {
    if (sedapSession._debugSession === debugSession) {
      callback(sedapSession);
    }
  });
}

vscode.debug.onDidReceiveDebugSessionCustomEvent(
  (e: vscode.DebugSessionCustomEvent) => {
    withMatchingSession(e.session, (sedapSession) => {
      sedapSession.handleCustomDebugEvent(e);
    });
  }
);

vscode.debug.onDidTerminateDebugSession((e: vscode.DebugSession) => {
  withMatchingSession(e, (sedapSession) => {
    sedapSession.dispose();
  });
});

export default class SEDAPSession {
  private sessionId: number;

  readonly _debugSession: vscode.DebugSession;

  readonly _panel: vscode.WebviewPanel;

  private _disposables: vscode.Disposable[] = [];

  public logEnabled: boolean;

  public readonly disposable: vscode.Disposable;

  public constructor(
    debugSession: vscode.DebugSession,
    panel: vscode.WebviewPanel,
    logEnabled = false
  ) {
    this.sessionId = sessionCount++;
    sessions[this.sessionId] = this;
    this._debugSession = debugSession;
    this._panel = panel;
    this.logEnabled = logEnabled;
    this.disposable = new vscode.Disposable(() => {
      this._dispose();
    });

    this._panel.webview.onDidReceiveMessage(
      (e) => this.handleMessageFromWebview(e),
      null,
      this._disposables
    );
    this._panel.onDidDispose(
      () => {
        this.disposable.dispose();
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    this.disposable.dispose();
  }

  private _dispose() {
    this._disposables.forEach((d) => d.dispose());
    delete sessions[this.sessionId];
  }

  handleCustomDebugEvent({ body, event }: vscode.DebugSessionCustomEvent) {
    if (event === "log") {
      if (!this.logEnabled) {
        return;
      }
      const { msg, json } = body as LogEvent;

      if (Object.keys(json).length === 0) {
        console.log(`<D> ${msg}`);
      } else {
        console.log(`<D> ${msg}`, json);
      }
    } else if (event === "debugStateUpdate") {
      this.updateState(body as DebuggerState);
    } else {
      console.error(`Unhandled custom event '${event}'`);
    }
  }

  private async handleMessageFromWebview(e: MessageFromWebview) {
    if (e.type === "request_state_update") {
      const state = await this.getDebuggerState();

      if (state !== undefined) {
        this.updateState(state);
      }
    } else if (e.type === "request_jump") {
      await this.jumpToCmd(e.cmdId);
    } else if (e.type === "request_exec_specific") {
      await this.execSpecificCmd(e.prevId, e.branchCase);
    } else if (e.type === "request_unification") {
      const unifyData = await this.getUnification(e.id);

      if (unifyData !== undefined) {
        const [unifyId, unifyMap] = unifyData;
        this.updateUnification(unifyId, unifyMap);
      }
    } else if (e.type === "request_start_proc") {
      this.startProc(e.procName);
    }
  }

  private getDebuggerState() {
    return this._debugSession.customRequest("debuggerState");
  }

  private async getUnification(
    id: number
  ): Promise<[number, UnifyMap] | undefined> {
    const result = await this._debugSession.customRequest("unification", {
      id,
    });
    const { unifyId, unifyMap } = result;

    return [unifyId, unifyMap];
  }

  private async jumpToCmd(id: number) {
    const result = await this._debugSession.customRequest("jump", {
      id,
    });

    if (!result.success) {
      vscode.window.showErrorMessage(result.err || "jumpToCmd: unknown error");
    }
  }

  private async execSpecificCmd(prevId: number, branchCase: BranchCase | null) {
    const result = await this._debugSession.customRequest("stepSpecific", {
      prevId,
      branchCase,
    });

    if (!result.success) {
      vscode.window.showErrorMessage(result.err || "help");
    }
  }

  private async startProc(procName: string) {
    const result = await this._debugSession.customRequest("startProc", {
      procName,
    });

    if (!result.success) {
      vscode.window.showErrorMessage(result.err || "startProc: unknown error");
    }
  }

  private async sendMessageToWebview(e: MessageToWebview) {
    await this._panel.webview.postMessage(e);
  }

  private async updateState(state: DebuggerState) {
    await this.sendMessageToWebview({ type: "state_update", state });
  }

  private async updateUnification(unifyId: number, unifyMap: UnifyMap) {
    await this.sendMessageToWebview({
      type: "unify_update",
      unifyId,
      unifyMap,
    });
  }
}
