import type { Document } from '@/features/projects/types';

/**
 * Generates a self-contained, standalone single-file HTML viewer.
 * No external servers, stylesheets or JS dependencies needed.
 */
export function exportToSelfContainedHTML(doc: Document): string {
  const isTree = doc.type === 'mindtree';
  const docTitle = doc.title || 'Mindgraph Export';
  const serializedData = JSON.stringify(doc.content, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle} - Mindgraph Standalone Viewer</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #131b2e;
      --card-border: #23314f;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --accent: #60a5fa;
      --edge: #475569;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      overflow: hidden;
      height: 100vh;
      width: 100vw;
      user-select: none;
    }
    header {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 52px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 100;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
    }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.2);
      color: var(--accent);
      border: 1px solid rgba(59, 130, 246, 0.4);
    }
    .controls {
      display: flex;
      gap: 8px;
    }
    button {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }
    button:hover {
      background: #1e293b;
      border-color: var(--primary);
    }
    #canvas-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0; left: 0;
      cursor: grab;
    }
    #canvas-container:active {
      cursor: grabbing;
    }
    svg#graph {
      width: 100%;
      height: 100%;
    }
    .node-card {
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
      cursor: pointer;
      transition: transform 0.1s ease;
    }
    .node-card:hover {
      transform: scale(1.02);
    }
    .edge-line {
      stroke: var(--edge);
      stroke-width: 2;
      fill: none;
    }
    .search-box {
      background: #0f172a;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>${docTitle}</span>
      <span class="badge">${isTree ? 'Mind Tree' : 'DB Designer'}</span>
    </div>
    <div class="controls">
      <input type="text" id="searchInput" class="search-box" placeholder="Search nodes..." />
      <button onclick="resetZoom()">Reset View</button>
      <button onclick="zoomIn()">Zoom +</button>
      <button onclick="zoomOut()">Zoom -</button>
    </div>
  </header>

  <div id="canvas-container">
    <svg id="graph">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="#1e293b" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <g id="viewport">
        <g id="edges-layer"></g>
        <g id="nodes-layer"></g>
      </g>
    </svg>
  </div>

  <script>
    const data = ${serializedData};
    const isTree = ${isTree};
    let transform = { x: 200, y: 150, k: 1 };
    let isPanning = false;
    let startX = 0, startY = 0;

    const container = document.getElementById('canvas-container');
    const viewport = document.getElementById('viewport');
    const nodesLayer = document.getElementById('nodes-layer');
    const edgesLayer = document.getElementById('edges-layer');

    function updateTransform() {
      viewport.setAttribute('transform', \`translate(\${transform.x}, \${transform.y}) scale(\${transform.k})\`);
    }

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.node-card')) return;
      isPanning = true;
      startX = e.clientX - transform.x;
      startY = e.clientY - transform.y;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      transform.x = e.clientX - startX;
      transform.y = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => { isPanning = false; });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newK = Math.max(0.1, Math.min(5, transform.k * zoomFactor));
      
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      transform.x = mouseX - (mouseX - transform.x) * (newK / transform.k);
      transform.y = mouseY - (mouseY - transform.y) * (newK / transform.k);
      transform.k = newK;
      updateTransform();
    }, { passive: false });

    function resetZoom() {
      transform = { x: 200, y: 150, k: 1 };
      updateTransform();
    }
    function zoomIn() {
      transform.k = Math.min(5, transform.k * 1.25);
      updateTransform();
    }
    function zoomOut() {
      transform.k = Math.max(0.1, transform.k / 1.25);
      updateTransform();
    }

    // Render nodes
    function render() {
      nodesLayer.innerHTML = '';
      edgesLayer.innerHTML = '';

      if (isTree && data && data.nodes) {
        // Render Mind Tree Edges
        if (data.edges) {
          data.edges.forEach(edge => {
            const source = data.nodes.find(n => n.id === edge.source);
            const target = data.nodes.find(n => n.id === edge.target);
            if (source && target) {
              const sx = (source.position?.x || 0) + 90;
              const sy = (source.position?.y || 0) + 20;
              const tx = (target.position?.x || 0);
              const ty = (target.position?.y || 0) + 20;
              const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              const dx = (tx - sx) / 2;
              path.setAttribute('d', \`M \${sx} \${sy} C \${sx + dx} \${sy}, \${tx - dx} \${ty}, \${tx} \${ty}\`);
              path.setAttribute('class', 'edge-line');
              path.setAttribute('marker-end', 'url(#arrow)');
              edgesLayer.appendChild(path);
            }
          });
        }

        // Render Mind Tree Nodes
        data.nodes.forEach(node => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'node-card');
          g.setAttribute('data-id', node.id);
          g.setAttribute('transform', \`translate(\${node.position?.x || 0}, \${node.position?.y || 0})\`);

          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('width', '180');
          rect.setAttribute('height', '44');
          rect.setAttribute('rx', '8');
          rect.setAttribute('fill', '#1e293b');
          rect.setAttribute('stroke', '#3b82f6');
          rect.setAttribute('stroke-width', '1.5');

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', '14');
          text.setAttribute('y', '27');
          text.setAttribute('fill', '#f8fafc');
          text.setAttribute('font-size', '13');
          text.setAttribute('font-weight', '500');
          text.textContent = (node.data?.label || 'Untitled').substring(0, 20);

          g.appendChild(rect);
          g.appendChild(text);
          nodesLayer.appendChild(g);
        });
      } else if (!isTree && data && data.tables) {
        // Render DB Tables
        data.tables.forEach(table => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'node-card');
          g.setAttribute('transform', \`translate(\${table.position?.x || 0}, \${table.position?.y || 0})\`);

          const colCount = table.columns?.length || 0;
          const height = 40 + colCount * 24 + 10;
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('width', '220');
          rect.setAttribute('height', height);
          rect.setAttribute('rx', '6');
          rect.setAttribute('fill', '#0f172a');
          rect.setAttribute('stroke', '#334155');
          rect.setAttribute('stroke-width', '1');

          const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          header.setAttribute('width', '220');
          header.setAttribute('height', '32');
          header.setAttribute('rx', '6');
          header.setAttribute('fill', table.color || '#3b82f6');

          const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          title.setAttribute('x', '12');
          title.setAttribute('y', '21');
          title.setAttribute('fill', '#ffffff');
          title.setAttribute('font-size', '13');
          title.setAttribute('font-weight', 'bold');
          title.textContent = table.name;

          g.appendChild(rect);
          g.appendChild(header);
          g.appendChild(title);

          (table.columns || []).forEach((col, idx) => {
            const colText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            colText.setAttribute('x', '12');
            colText.setAttribute('y', 56 + idx * 24);
            colText.setAttribute('fill', col.isPrimary ? '#fbbf24' : '#cbd5e1');
            colText.setAttribute('font-size', '12');
            colText.textContent = (col.isPrimary ? '🔑 ' : '   ') + col.name + ' : ' + col.type;
            g.appendChild(colText);
          });

          nodesLayer.appendChild(g);
        });
      }
    }

    document.getElementById('searchInput').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.node-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.opacity = !q || text.includes(q) ? '1' : '0.2';
      });
    });

    render();
    updateTransform();
  </script>
</body>
</html>`;
}
