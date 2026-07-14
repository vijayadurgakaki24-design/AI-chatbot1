# K-Hub Python Chatbot: Plain-English Code Guide
This guide explains how the **Backend**, **Frontend**, and **Storage** work in your Python chatbot project. It is written in simple, everyday language to help you prepare for your K-Hub interview presentation!

---

## 1. Storage & Database (SQLite / chat.db)
**The Concept**: Instead of installing a massive database server (like MySQL or MongoDB), our project saves all data inside a single file called **`chat.db`** inside the `storage/` folder. It is lightweight, fast, and does not require any passwords to access.

### Core Database Code:
*   **`get_db()` (Line 85 in app.py)**:
    This function is like opening a door to the database. Every time the server needs to read or write chat messages, it calls `get_db()` to establish a connection to `storage/chat.db`.
*   **`init_db()` (Line 92 in app.py)**:
    When you start the server, this function runs first. It check if tables exist. If they don't, it creates two database sheets:
    1.  **`conversations`**: Stores the title of each chat session and the user ID who created it.
    2.  **`messages`**: Stores individual text bubbles (user queries and AI responses), links them to their conversation via `conversation_id`, and saves details like the date and time.
*   **`ON DELETE CASCADE`**:
    This is set on the messages table definition. It means if you click delete on a conversation chip, the database automatically cleans up and deletes all messages belonging to that conversation, keeping the database clean.

---

## 2. The Backend (Flask / backend/app.py)
**The Concept**: Flask is a Python library that acts as the server. It listens for requests from the browser, runs Python code, calls the AI (or runs a simulation if offline), and sends data back.

### Key Python Functions:
*   **`login_required` Decorator (Line 140)**:
    This is a security check. Before a user can view, rename, or write messages, this decorator checks if they are logged in. If not, it blocks them and returns an error.
*   **`chat()` Route (Line 660)**:
    This function handles sending a message:
    1. It reads the message text and files sent by your browser.
    2. It saves your message to the SQLite database.
    3. It loads the chat history so the AI remembers previous questions.
    4. It triggers `sse_generator()` to stream the response back.
*   **`sse_generator()` Function (Line 755)**:
    Instead of waiting for the AI to write a long paragraph and sending it all at once, this function streams the answer word-by-word (Server-Sent Events).
    *   If a user closes their tab early, this function catches a `GeneratorExit` error, stops requesting words from the AI, saves what it wrote to the database, and closes the connection cleanly.
*   **`parse_file()` Helper (Line 376)**:
    When you upload a file, this helper checks its extension. It calls `parse_pdf()` or `parse_docx()` to read the text inside the file and paste it directly into the prompt so the AI can answer questions about your files.

---

## 3. The Frontend (HTML / CSS / JS)
**The Concept**: The frontend is the visual page you see in your browser. It sends requests to the Flask backend and renders the chat bubbles on screen.

### The Three Files:
1.  **`frontend/index.html`**:
    This holds the visual structure of your dashboard. It defines the layout grid, the sidebar container, the text input wrapper, the settings dialog, and the welcome screen.
2.  **`frontend/static/style.css`**:
    This handles all colors, buttons, hover animations, and font sizes.
    *   It uses CSS variables (like `--bg-color` and `--text-primary`) under `:root` to handle colors.
    *   When you toggle dark or light mode, JavaScript changes the theme attribute on the webpage, and CSS automatically swaps variables to change colors instantly.
3.  **`frontend/static/script.js`**:
    This is the brain of the browser:
    *   **DOM Caching**: When the page loads, it saves references to all buttons and text areas inside a single `elements` object so searching is fast.
    *   **Send Message Logic**: When you click Send, it captures the text, initiates an `AbortController` (to let you stop generating if needed), and calls the backend `/chat` link.
    *   **Stream Reader**: It reads the incoming word stream from Flask and appends the words inside the active AI chat bubble dynamically.
    *   **XSS Protection**: Before printing your text, it escapes characters like `<` and `>` to make sure hackers cannot inject malicious web scripts into the chat.
