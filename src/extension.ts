
import * as vscode from "vscode";
import * as childProcess from "child_process";
import * as path from "path";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  let disposable = vscode.commands.registerCommand(
    "azureDashboardPreview.showPreview",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "azureDashboardPreview",
        "Azure Dashboard Preview",
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      updateWebview(panel);

      vscode.workspace.onDidChangeTextDocument(() => updateWebview(panel));
    }
  );

  context.subscriptions.push(disposable);
}

function updateWebview(panel: vscode.WebviewPanel) {
  if (!vscode.window.activeTextEditor) {return;}

  const filePath = vscode.window.activeTextEditor.document.uri.fsPath;
  const fileExt = path.extname(filePath).toLowerCase();

  if (fileExt === ".bicep") {
    const dashboardJson = parseBicepToJson(
      vscode.window.activeTextEditor.document.uri.fsPath
    );

    dashboardJson
      .then((json) => {
        panel.webview.html = getWebviewContent(json);
      })
      .catch((error) => {
        panel.webview.html = getWebviewContent({
          error: `Failed to convert Bicep: ${error.message}`,
        });
      });
  } else if (fileExt === ".json") {
    const text = vscode.window.activeTextEditor.document.getText();
    const dashboardJson = parseDashboard(text);
    panel.webview.html = getWebviewContent(dashboardJson);
  } else {
    vscode.window.showErrorMessage(
      "Unsupported file type. Please open a Bicep or ARM JSON file."
    );
    return;
  }
}

function parseDashboard(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Invalid JSON" };
  }
}

function parseBicepToJson(bicepFilePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const bicepPath = path.resolve(bicepFilePath);

    // Execute the 'bicep build' command to convert the Bicep file to ARM JSON
    childProcess.exec(
      `bicep build ${bicepPath} --stdout`,
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          try {
            const json = JSON.parse(stdout); // Parse the JSON output
            resolve(json);
          } catch (err) {
            reject(
              new Error("Failed to parse the Bicep build output as JSON.")
            );
          }
        }
      }
    );
  });
}

function extractTiles(dashboardJson: any): any[] {
  const tiles: any[] = [];
  var dashboardResource;
  if (dashboardJson && dashboardJson.resources) {
    // Filter resources to get the dashboard type
    dashboardResource = dashboardJson.resources.find(
      (resource: any) => resource.type === "Microsoft.Portal/dashboards"
    );
  } else if (dashboardJson.type === "Microsoft.Portal/dashboards") {
    dashboardResource = dashboardJson;
  }

  if (
    dashboardResource &&
    dashboardResource.properties &&
    dashboardResource.properties.lenses &&
    dashboardResource.properties.lenses[0].parts
  ) {
    // Extract the parts (tiles) from the lens
    const parts = dashboardResource.properties.lenses[0].parts;

    // Process each part (tile) and extract relevant data
    parts.forEach((part: any) => {
      tiles.push({
        title: part.metadata.type.split("/").at(-1) || "Untitled Tile",
        position: part.position || { x: 0, y: 0 }, 
        content: JSON.stringify(part.position), 
      });
    });
  }
  return tiles;
}

function getWebviewContent(dashboardJson: any): string {
  const tiles = extractTiles(dashboardJson);
  let tileHtml = tiles
    .map((tile) => {
      return `
            <div class="tile"
             style="
              grid-column: ${tile.position.x + 1} / span ${
        tile.position.colSpan || 1
      }; 
              grid-row: ${tile.position.y + 1} / span ${
        tile.position.rowSpan || 1
      };
                ">
                <h3>${tile.title}</h3>
                <div class="tile-content">${tile.content}</div>
            </div>`;
    })
    .join("");

  var html = `
    <html>
    <head>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 10px;
            }
            .tiles-container {
                display: grid;
                grid-template-columns: repeat(18, 1fr);
                gap: 10px;
                margin-top: 20px;
            }
            .tile {
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 10px;
                background-color: #f4f4f4;
                box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.1);
                transition: all 0.3s ease;
            }
            .tile:hover {
                background-color: #e0e0e0;
                transform: translateY(-5px);
            }
            .tile h3 {
                margin: 0;
                font-size: 1.1em;
            }
            .tile-content {
                margin-top: 10px;
                font-size: 0.9em;
                color: #555;
            }
        </style>
    </head>
    <body>
        <h2>Azure Dashboard Layout</h2>
        <div class="tiles-container">
            ${tileHtml}
        </div>
    </body>
    </html>`;
  return html;
}

export function deactivate() {}
