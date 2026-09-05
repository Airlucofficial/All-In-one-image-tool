#!/usr/bin/env python3
"""
Luminary Image Studio - Local Web Server
Runs a local HTTP server and automatically opens your default browser.
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import json
import datetime

PORT = 8080
HISTORY_FILE = "PROJECT_HISTORY.md"

class LuminaryStudioHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/get-history':
            self.handle_get_history()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/save-history':
            self.handle_save_history()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_get_history(self):
        try:
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'content': content, 'exists': True}).encode('utf-8'))
            else:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'content': '', 'exists': False}).encode('utf-8'))
        except Exception as e:
            self.send_error(500, f"Error reading history: {str(e)}")

    def handle_save_history(self):
        try:
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len).decode('utf-8')
            data = json.loads(body) if body else {}

            actions = data.get('actions', [])
            action_entry = data.get('entry')
            now_iso = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Update timestamp in header if present
                content = content.replace(
                    "> **System Status**: Active Development",
                    f"> **System Status**: Active Development  \n> **Last Auto-Save**: {now_iso}"
                )

                # Append new live session entries if not already present
                section_header = "## 5. Live Browser Session History (Auto-Saved)"
                if section_header not in content:
                    content += f"\n\n---\n\n{section_header}\n\n| Timestamp | Tool | Description |\n| :--- | :--- | :--- |\n"

                lines_to_add = []
                if action_entry:
                    t = action_entry.get('displayTime', now_iso)
                    tool = action_entry.get('toolName', 'Action')
                    desc = action_entry.get('description', '')
                    lines_to_add.append(f"| {t} | **{tool}** | {desc} |\n")
                elif actions:
                    for act in reversed(actions[:10]):
                        t = act.get('displayTime', now_iso)
                        tool = act.get('toolName', 'Action')
                        desc = act.get('description', '')
                        entry_str = f"| {t} | **{tool}** | {desc} |\n"
                        if entry_str not in content:
                            lines_to_add.append(entry_str)

                for line in lines_to_add:
                    content += line

                with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                    f.write(content)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'saved_at': now_iso}).encode('utf-8'))
        except Exception as e:
            self.send_error(500, f"Error saving history: {str(e)}")

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    global PORT
    while PORT < 8100:
        try:
            with socketserver.TCPServer(("", PORT), LuminaryStudioHandler) as httpd:
                url = f"http://localhost:{PORT}/index.html"
                print(f"======================================================")
                print(f"  Luminary Image Studio — All-In-One Pro Image Suite  ")
                print(f"======================================================")
                print(f"  Running locally at: {url}")
                print(f"  Auto-syncing to: {HISTORY_FILE}")
                print(f"  Opening browser automatically...")
                print(f"  Press Ctrl+C to terminate the server.")
                print(f"======================================================")
                webbrowser.open(url)
                httpd.serve_forever()
        except OSError:
            PORT += 1

if __name__ == '__main__':
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)

