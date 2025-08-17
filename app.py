from flask import Flask, render_template, jsonify, send_from_directory, abort
import json
import os

app = Flask(__name__, static_folder="static", template_folder="templates")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/patterns")
def api_patterns():
    patterns_path = os.path.join(app.static_folder, "patterns.json")
    if not os.path.exists(patterns_path):
        abort(404)
    with open(patterns_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return jsonify(data)


if __name__ == "__main__":
    # For development only. In production, use a WSGI server.
    app.run(host="0.0.0.0", port=5000, debug=True)
