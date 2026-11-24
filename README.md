
# 🚘 EuroCars

A modern European automotive marketplace designed to simplify
buying and selling vehicles across Europe.

[![Live Demo](https://img.shields.io/badge/Live_Demo-EuroCars-2563EB?style=for-the-badge&logo=vercel)](https://eurocars-gray.vercel.app)

## 🛠️ Tech Stack

![Nuxt](https://img.shields.io/badge/Nuxt_4-002E3B?style=for-the-badge&logo=nuxt&logoColor=00DC82)
![Vue](https://img.shields.io/badge/Vue_3-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Neon](https://img.shields.io/badge/Neon-00E599?style=for-the-badge&logo=neon&logoColor=black)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Sharp](https://img.shields.io/badge/Sharp-99CC00?style=for-the-badge&logo=sharp&logoColor=white)

## 📖 Overview

EuroCars is a full-stack automotive marketplace featuring
vehicle discovery, listing management, user accounts,
and an administrative dashboard.

The platform combines a premium automotive design with
a modern server-side architecture and cloud infrastructure.

## ✨ Features

### 🚗 Marketplace

- Vehicle catalog
- Advanced search and filtering
- Detailed vehicle specifications
- Vehicle photo galleries
- Favorites
- Responsive design

### 👤 User Account

- User registration and authentication
- Persistent sessions
- Profile management
- Avatar management
- Personal vehicle listings
- Favorites management

### 📝 Listing Management

- Multi-step listing creation wizard
- Multiple vehicle photos
- Vehicle specifications and equipment
- Listing editing
- Draft management
- Listing moderation
- Listing archiving

### 🛡️ Administration

- Administrative dashboard
- Marketplace analytics
- User management
- Vehicle listing management
- Dealership management
- Listing moderation
- Audit logs
- System health monitoring

### 🔒 Security

- Secure password hashing
- HTTP-only session cookies
- Role-based access control
- Server-side validation
- Rate limiting
- Parameterized SQL queries
- Request origin validation

## 🏗️ Architecture

```mermaid
flowchart TD
    A[Client Browser] --> B[Nuxt 4 / Vue 3]
    B --> C[Nitro Server API]
    C --> D[Neon PostgreSQL]
    C --> E[Vercel Blob]
    C --> F[Sharp Image Processing]
```

## ☁️ Infrastructure

| Service | Purpose |
|---------|---------|
| Vercel | Application hosting |
| Nitro | Backend API |
| Neon | PostgreSQL database |
| Vercel Blob | Cloud image storage |
| Sharp | Image optimization |


## 📸 Screenshots

<details>
<summary>🏠 Homepage</summary>

![Homepage 1](docs/screenshots/Homepage-1.png)
![Homepage 2](docs/screenshots/Homepage-2.png)

</details>

<details>
<summary>🚗 Vehicle Catalog</summary>

![Vehicle Catalog](docs/screenshots/Cars.png)

</details>

<details>
<summary>📝 Sell Your Car — Listing Wizard</summary>

![Step 1](docs/screenshots/Sell-1.png)
![Step 2](docs/screenshots/Sell-2.png)
![Step 3](docs/screenshots/Sell-3.png)
![Step 4](docs/screenshots/Sell-4.png)
![Step 5](docs/screenshots/Sell-5.png)

</details>

<details>
<summary>👤 My Listings</summary>

![My Listings](docs/screenshots/My-Listing.png)

</details>

<details>
<summary>🛡️ Admin Dashboard</summary>

![Admin Dashboard 1](docs/screenshots/Admin-1.png)
![Admin Dashboard 2](docs/screenshots/Admin-2.png)
![Admin Dashboard 3](docs/screenshots/Admin-3.png)
![Admin Dashboard 4](docs/screenshots/Admin-4.png)

</details>


## 🚀 Getting Started

Clone the repository:

```bash
git clone https://github.com/scRelic/Eurocars.git
cd Eurocars
```

Navigate to the application directory containing package.json.

Install dependencies:

```bash
npm install
```

Configure environment variables using `.env.example`
and initialize the PostgreSQL database using the
provided SQL schema and migrations.

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## 🗺️ Roadmap

- [ ] Real-time messaging
- [ ] Email verification
- [ ] Password recovery
- [ ] Advanced price analytics
- [ ] Vehicle comparison
- [ ] Saved searches
- [ ] Notifications
- [ ] Multilingual support

## ⚠️ Disclaimer

EuroCars is a portfolio and demonstration project.
Demo vehicle listings are for illustrative purposes
and do not represent actual offers for sale.

## 👨‍💻 Author

Developed by [scRelic](https://github.com/scRelic).

---

⭐ If you find this project interesting, consider giving it a star.
