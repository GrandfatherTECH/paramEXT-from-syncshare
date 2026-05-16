# Project Overview: paramEXT

`paramEXT` is an enhanced version of the SyncShare extension, designed to automate and assist with tests on learning platforms like **Moodle** and **OpenEdu**. It consists of a Chrome extension (Manifest V3) and a Python-based backend that handles data synchronization, statistics, and user management via a Telegram bot.

## 🏗 Architecture

The system follows a client-server architecture with three main components:

1.  **Chrome Extension (Frontend/Client):**
    *   **Manifest V3:** Utilizes modern extension standards including Service Workers.
    *   **Content Scripts:** Injected into Moodle and OpenEdu pages to provide "Wand" (inline assistance), "Auto-Insert", and "Auto-Solve" features.
    *   **Popup UI:** A Bootstrap-based interface for settings and platform-specific controls.
    *   **Background Worker:** Acts as a proxy for cross-origin API requests and manages global state.

2.  **FastAPI Backend (Server):**
    *   **REST API:** Provides endpoints for submitting test attempts, querying statistics, and logging.
    *   **PostgreSQL:** Stores user data, test metadata, questions, and verified answer statistics.
    *   **Asyncpg:** Used for high-performance asynchronous database operations.

3.  **Telegram Bot:**
    *   **User Management:** Handles registration, API token generation, and usage statistics.
    *   **Notifications:** Forwards client logs and system events to administrators.

## 🔄 Working Scheme

1.  **Data Collection:** As users take tests, the extension collects questions and chosen answers.
2.  **Synchronization:** If an answer is verified (e.g., after test completion or via known correct patterns), it's sent to the backend.
3.  **Aggregation:** The backend aggregates results to build a "crowdsourced" database of correct answers.
4.  **Assistance:** When a user opens a test, the extension queries the backend for the most frequent/verified answers and displays them via the "Wand" tool or inserts them automatically.

## 🛠 Libraries & Frameworks

### Extension (JavaScript)
*   **Bootstrap 5:** Styling for the popup and settings pages.
*   **FontAwesome:** Icons for the UI.
*   **Popper.js:** For tooltips and dropdowns.
*   **Vanilla JS:** Core logic is implemented in standard JavaScript for performance and compatibility.

### Backend (Python)
*   **FastAPI:** High-performance web framework.
*   **Pydantic:** Data validation and settings management.
*   **Asyncpg:** Asynchronous PostgreSQL client.
*   **Aiogram / Telethon:** (Inferred) for Telegram bot interaction.
*   **Docker:** Containerization for deployment.

## 🎨 Coding Style & Practices

### JavaScript (Extension)
*   **Functional Encapsulation:** Extensive use of IIFEs (Immediately Invoked Function Expressions) to avoid global namespace pollution in content scripts.
*   **Asynchronous Patterns:** Heavy use of `async/await` for storage and API interactions.
*   **Modularization:** Logic is split across specific files (`commons.js`, `telemetry.js`, `platform_settings.js`) to promote reuse.
*   **DOM Manipulation:** Direct manipulation of the DOM for injecting UI elements ("Wands") into third-party sites.

### Python (Backend)
*   **Type Hinting:** Strict use of Python type hints for better maintainability and IDE support.
*   **Asynchronous Programming:** `async/await` is used throughout the database and API layers.
*   **Schema-Driven:** Database schemas are managed within the code (automatic initialization and evolution).
*   **Security:** Token-based authentication for API requests, with tokens managed via the Telegram bot.

### General
*   **Localization:** Support for English and Russian via `_locales`.
*   **Telemetry:** Custom logging system for tracking extension state and errors.
*   **Clean Separation:** Clear distinction between platform-specific logic (Moodle vs. OpenEdu) in both frontend and backend.
