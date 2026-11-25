import type { DeployFile, ProjectKind } from './types';

export interface StarterTemplate {
  id: string;
  label: string;
  kind: ProjectKind;
  description: string;
  files: DeployFile[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'vitrine',
    label: 'Site Vitrine PME',
    kind: 'site',
    description: 'Page de présentation complète avec feuille de style CSS et navigation accessible.',
    files: [
      {
        path: 'index.html',
        encoding: 'utf8',
        content: `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mon Site Vitrine — Hébergé sur Hébergio</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="topbar">
    <span class="brand">Atelier Horizon</span>
    <nav aria-label="Navigation principale">
      <a href="#services">Services</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>Des solutions numériques fiables pour votre activité.</h1>
      <p>Ce site web statique est déployé et servi en direct depuis Hébergio.</p>
      <a class="cta" href="#contact">Demander un devis</a>
    </section>
    <section id="services" class="grid">
      <article class="card">
        <h2>01. Développement Web</h2>
        <p>Sites rapides, accessibles et adaptés aux connexions mobiles.</p>
      </article>
      <article class="card">
        <h2>02. Applications Métier</h2>
        <p>Outils de gestion sur mesure pour équipes locales et PME.</p>
      </article>
    </section>
    <section id="contact" class="contact">
      <h2>Contact rapide</h2>
      <p>Personnalisez ce fichier <code>index.html</code> depuis votre console Hébergio.</p>
    </section>
  </main>
</body>
</html>
`,
      },
      {
        path: 'styles.css',
        encoding: 'utf8',
        content: `:root {
  color-scheme: light;
  font-family: system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f8fafc;
  color: #0f172a;
  line-height: 1.6;
}
.topbar {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
}
.brand { font-weight: 700; font-size: 1.125rem; }
nav { display: flex; gap: 1.5rem; }
nav a { color: #334155; text-decoration: none; font-weight: 500; }
nav a:hover { color: #0369a1; text-decoration: underline; }
main { max-width: 64rem; margin: 0 auto; padding: 3rem 1.5rem; }
.hero h1 { font-size: clamp(1.875rem, 4vw, 3rem); line-height: 1.15; max-width: 18ch; margin: 0 0 1rem; }
.hero p { color: #475569; max-width: 52ch; margin: 0 0 1.5rem; }
.cta {
  display: inline-block;
  background: #0369a1;
  color: #ffffff;
  padding: 0.75rem 1.25rem;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  margin-top: 3rem;
}
.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.5rem;
}
.card h2 { font-size: 1.125rem; margin: 0 0 0.5rem; }
.card p { margin: 0; color: #475569; }
.contact { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #e2e8f0; }
`,
      },
    ],
  },
  {
    id: 'webapp',
    label: 'Application Web Interactive',
    kind: 'webapp',
    description: 'Application HTML + CSS + JavaScript avec suivi de tâches persistant dans le navigateur.',
    files: [
      {
        path: 'index.html',
        encoding: 'utf8',
        content: `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Carnet de Commandes — App Web</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="container">
    <header>
      <h1>Carnet de suivi client</h1>
      <p>Application web interactive hébergée sur Hébergio.</p>
    </header>
    <form id="task-form" class="form">
      <label for="task-input" class="sr-only">Nouvelle entrée</label>
      <input id="task-input" type="text" placeholder="Ex. Livraison client Plateau — 15 000 FCFA" required />
      <button type="submit">Ajouter</button>
    </form>
    <ul id="task-list" class="list" aria-live="polite"></ul>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`,
      },
      {
        path: 'styles.css',
        encoding: 'utf8',
        content: `body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f1f5f9;
  color: #0f172a;
  margin: 0;
  padding: 2rem 1rem;
}
.container {
  max-width: 40rem;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  padding: 1.5rem;
}
h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
p { margin: 0 0 1.25rem; color: #475569; }
.form { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
input {
  flex: 1;
  padding: 0.625rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
}
button {
  background: #0369a1;
  color: #ffffff;
  border: 0;
  border-radius: 0.5rem;
  padding: 0.625rem 1rem;
  font-weight: 600;
  cursor: pointer;
}
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
`,
      },
      {
        path: 'app.js',
        encoding: 'utf8',
        content: `const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const list = document.getElementById('task-list');
const items = [];

function render() {
  list.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'Aucune entrée pour le moment.';
    list.appendChild(empty);
    return;
  }
  items.forEach((label, index) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Supprimer';
    btn.addEventListener('click', () => {
      items.splice(index, 1);
      render();
    });
    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  items.unshift(value);
  input.value = '';
  render();
});

render();
`,
      },
    ],
  },
  {
    id: 'minimal',
    label: 'Page HTML minimale',
    kind: 'site',
    description: 'Point de départ vierge avec un seul fichier index.html.',
    files: [
      {
        path: 'index.html',
        encoding: 'utf8',
        content: `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nouveau site Hébergio</title>
</head>
<body style="font-family: system-ui, sans-serif; padding: 2rem; max-width: 44rem; margin: 0 auto;">
  <h1>Votre site est en ligne</h1>
  <p>Modifiez ce fichier ou importez vos propres fichiers HTML, CSS, JS et images.</p>
</body>
</html>
`,
      },
    ],
  },
];
