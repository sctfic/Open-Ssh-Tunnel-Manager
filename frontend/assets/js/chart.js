/**
 * Graphique D3.js miroir : largeur disponible, à raison de 3 pixels/seconde.
 * Courbe au-dessus de 0 : Upload (↗)
 * Courbe en-dessous de 0 : Download (↙)
 */

export class TunnelRateChart {
  constructor(container, maxSamples = 60, limits = { up: 0, down: 0 }) {
    this.container = container;
    this.limits = limits;
    this.maxSamples = maxSamples;
    this.history = [{ at: performance.now(), time: 0, up: 0, down: 0 }];
    this.mounted = false;
    this.init();
    // Le footer peut changer de largeur sans nouveau débit (redimensionnement).
    this.observer = new ResizeObserver(() => {
      if (Math.round(this.container.clientWidth) !== this.width) this.init();
    });
    this.observer.observe(container);
  }

  init() {
    const d3 = window.d3;
    if (!d3 || !this.container) return;

    this.container.innerHTML = '';
    this.width = Math.max(34, Math.round(this.container.clientWidth));
    this.height = 60;
    this.margin = { top: 3, right: 3, bottom: 10, left: 30 };
    this.period = (this.width - this.margin.left - this.margin.right) / 3;
    this.container.setAttribute('aria-label', `Historique sur ${Math.round(this.period)} secondes, 3 pixels par seconde`);

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('class', 'tunnel-d3-svg');

    const defs = this.svg.append('defs');

    // Dégradé Upload (au-dessus de 0 : vers le haut)
    const upGrad = defs.append('linearGradient')
      .attr('id', `up-grad-${Math.random().toString(36).slice(2, 8)}`)
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    upGrad.append('stop').attr('offset', '0%').attr('stop-color', '#7a8cff').attr('stop-opacity', 0.6);
    upGrad.append('stop').attr('offset', '100%').attr('stop-color', '#7a8cff').attr('stop-opacity', 0.03);
    this.upGradId = upGrad.attr('id');

    // Dégradé Download (en-dessous de 0 : vers le bas)
    const downGrad = defs.append('linearGradient')
      .attr('id', `down-grad-${Math.random().toString(36).slice(2, 8)}`)
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    downGrad.append('stop').attr('offset', '0%').attr('stop-color', '#56d9c3').attr('stop-opacity', 0.03);
    downGrad.append('stop').attr('offset', '100%').attr('stop-color', '#56d9c3').attr('stop-opacity', 0.6);
    this.downGradId = downGrad.attr('id');

    // Échelles
    this.x = d3.scaleLinear()
      .domain([-this.period, 0])
      .range([this.margin.left, this.width - this.margin.right]);

    this.y = d3.scaleLinear()
      .range([this.height - this.margin.bottom, this.margin.top]);

    // Lignes verticales de grille (-45s, -30s, -15s)
    this.gridGroup = this.svg.append('g').attr('class', 'chart-grid');
    [-.75, -.5, -.25].map(fraction => Math.round(fraction * this.period)).forEach(t => {
      this.gridGroup.append('line')
        .attr('x1', this.x(t))
        .attr('x2', this.x(t))
        .attr('y1', this.margin.top)
        .attr('y2', this.height - this.margin.bottom)
        .attr('stroke', 'rgba(255, 255, 255, 0.05)')
        .attr('stroke-dasharray', '2 3');
      
      this.gridGroup.append('text')
        .attr('x', this.x(t))
        .attr('y', this.height - 4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#64748b')
        .attr('font-size', '8px')
        .text(`${Math.abs(t)}s`);
    });

    // Ligne zéro centrale (neutre)
    this.zeroLine = this.svg.append('line')
      .attr('class', 'chart-zero-line')
      .attr('stroke', 'rgba(255, 255, 255, 0.16)')
      .attr('stroke-dasharray', '3 3')
      .attr('x1', this.margin.left)
      .attr('x2', this.width - this.margin.right);

    // Aires remplies
    this.upAreaPath = this.svg.append('path')
      .attr('fill', `url(#${this.upGradId})`);

    this.downAreaPath = this.svg.append('path')
      .attr('fill', `url(#${this.downGradId})`);

    // Courbes tracées
    this.upLinePath = this.svg.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#7a8cff')
      .attr('stroke-width', 1.8)
      .attr('stroke-linecap', 'round');

    this.downLinePath = this.svg.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#56d9c3')
      .attr('stroke-width', 1.8)
      .attr('stroke-linecap', 'round');

    // Points lumineux d'extrémité (valeur instantanée à t=0)
    this.dotUp = this.svg.append('circle')
      .attr('r', 1.5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#7a8cff')
      .attr('stroke-width', 2);

    this.dotDown = this.svg.append('circle')
      .attr('r', 1.5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#56d9c3')
      .attr('stroke-width', 2);

    // Labels d'échelle Y
    this.labelUp = this.svg.append('text')
      .attr('x', this.margin.left - 6)
      .attr('y', this.margin.top + 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#7a8cff')
      .attr('font-size', '8.5px')
      .attr('font-weight', '600');

    this.labelZero = this.svg.append('text')
      .attr('x', this.margin.left - 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')
      .text('0');

    this.labelDown = this.svg.append('text')
      .attr('x', this.margin.left - 6)
      .attr('y', this.height - this.margin.bottom)
      .attr('text-anchor', 'end')
      .attr('fill', '#56d9c3')
      .attr('font-size', '8.5px')
      .attr('font-weight', '600');

    this.mounted = true;
    this.render();
  }

  push(upKo, downKo) {
    const now = performance.now();
    this.history.push({ at: now, time: 0, up: Math.max(0, Number(upKo) || 0), down: Math.max(0, Number(downKo) || 0) });
    // Les positions utilisent le temps réel, même si les événements SSE arrivent irrégulièrement.
    this.history = this.history.filter(sample => now - sample.at <= this.period * 1000);
    for (const sample of this.history) sample.time = (sample.at - now) / 1000;
    if (this.mounted) {
      this.render();
    }
  }

  render() {
    const d3 = window.d3;
    if (!d3 || !this.mounted) return;

    // Chaque moitié utilise sa propre limite ; illimité adapte son échelle
    // à l'historique. Le zéro reste central même si Up et Down diffèrent.
    const upScale = this.limits.up || Math.max(10, Math.ceil(d3.max(this.history, d => d.up) * 1.15));
    const downScale = this.limits.down || Math.max(10, Math.ceil(d3.max(this.history, d => d.down) * 1.15));
    this.y.domain([-downScale, 0, upScale])
      .range([this.height - this.margin.bottom, (this.margin.top + this.height - this.margin.bottom) / 2, this.margin.top]).clamp(true);

    const zeroY = this.y(0);
    this.zeroLine.attr('y1', zeroY).attr('y2', zeroY);
    this.labelZero.attr('y', zeroY + 3);

    const fmtRate = val => val >= 1000 ? `${(val / 1000).toFixed(1)}M` : `${Math.round(val)}K`;
    this.labelUp.text(`+${fmtRate(upScale)}`);
    this.labelDown.text(`-${fmtRate(downScale)}`);

    const areaUp = d3.area()
      .curve(d3.curveMonotoneX)
      .x(d => this.x(d.time))
      .y0(zeroY)
      .y1(d => this.y(d.up));

    const areaDown = d3.area()
      .curve(d3.curveMonotoneX)
      .x(d => this.x(d.time))
      .y0(zeroY)
      .y1(d => this.y(-d.down));

    const lineUp = d3.line()
      .curve(d3.curveMonotoneX)
      .x(d => this.x(d.time))
      .y(d => this.y(d.up));

    const lineDown = d3.line()
      .curve(d3.curveMonotoneX)
      .x(d => this.x(d.time))
      .y(d => this.y(-d.down));

    this.upAreaPath.datum(this.history).attr('d', areaUp);
    this.downAreaPath.datum(this.history).attr('d', areaDown);
    this.upLinePath.datum(this.history).attr('d', lineUp);
    this.downLinePath.datum(this.history).attr('d', lineDown);

    const current = this.history[this.history.length - 1];
    const currentX = this.x(0);
    this.dotUp
      .attr('cx', currentX)
      .attr('cy', this.y(current.up))
      .attr('opacity', current.up > 0.05 ? 1 : 0);

    this.dotDown
      .attr('cx', currentX)
      .attr('cy', this.y(-current.down))
      .attr('opacity', current.down > 0.05 ? 1 : 0);
  }

  destroy() {
    this.mounted = false;
    this.observer?.disconnect();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
