# QR Table & Real-Time Menu Application

A premium, state-of-the-art QR Table Ordering and Real-Time Kitchen Tracking application built with React, TypeScript, Vite, Tailwind CSS, and Firebase Realtime Database. 

---

## 🌟 Key Features

1. **Table-specific Ordering:** Dynamic menu loading scoped to restaurant parameters (`r`) and table numbers (`t`).
2. **Real-time Kitchen Dashboard:** Chefs can view, accept, prepare, and complete orders in real-time.
3. **Reactive Customer Order Tracking:** Customers are redirected to a dedicated success tracking page (`/order/success`) showing step-by-step progress (`RECEIVED` ➜ `PREPARING` ➜ `ORDER UP` ➜ `SERVED`) in real-time.
4. **Resilient Offline Fallbacks:** Specially engineered to catch WebSocket dropouts on iOS Safari, falling back automatically to high-entropy secure order numbering over HTTP long-polling transport.
5. **Cash and Card checkout integrations.**

---

## 📂 Project Structure

```
d:\QR_TABLE\
├── .cursorrules           # AI Development guidelines & coding practices
├── handoff_doc.md         # Full system architecture, solved bugs, & design specs
├── database.rules.json    # Firebase Realtime Database security constraints
├── firebase.json          # Firebase suite configuration
├── src/
│   ├── components/        # Shared user interface components
│   ├── lib/               # Firebase setup, Stripe setup, and transaction fallbacks
│   ├── pages/             # App pages (/order, /kitchen, /order/success)
│   └── types/             # Common TypeScript interfaces
```

---

## 🛠️ Getting Started & Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Local Environment Setup
Create a `.env` file in the root directory (based on `.env.example`) and insert your Firebase credentials:
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_DATABASE_URL=your_rtdb_url
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production (Zero TypeScript Errors)
```bash
npm run build
```

### 5. Deploy to Production
```bash
# Deploy security rules
firebase deploy --only database

# Deploy frontend hosting
firebase deploy --only hosting
```

---

## 📖 Essential Developer Documents

- **AI Development Guidelines:** Refer to [.cursorrules](file:///d:/QR_TABLE/.cursorrules) for styling instructions, Firebase transactions handling, and subscription teardown.
- **Architectural & Debugging Handoff:** Refer to [handoff_doc.md](file:///d:/QR_TABLE/handoff_doc.md) for sequence diagrams of the real-time order data flows and Safari-compatibility details.
