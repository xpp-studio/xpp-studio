# XPP Studio

A browser workbench for differential equations, maps and stochastic models that reads [XPPAUT](https://sites.pitt.edu/~phase/bard/bardware/xpp/xpp.html) `.ode` files. Everything runs in a single web page, with nothing to install, and no data leaves your browser.

**Try it:** https://xpp-studio.github.io/xpp-studio/

## Features

- **Phase planes and plots:** phase planes with nullclines, direction fields, equilibria and separatrices; 3D views; time courses; equal-axes option.
- **Live parameters:** parameter sliders update trajectories, nullclines and equilibria as you drag.
- **One-parameter continuation:** equilibria and periodic orbits (multiple shooting with Floquet multipliers). Detects:
  - folds, Hopf points (sub- or supercritical, from the first Lyapunov coefficient) and branch points;
  - period doublings, torus points and folds of cycles.
- **Two-parameter continuation:** curves of folds, Hopf points, period doublings, and folds and period doublings of cycles. Detects Bogdanov–Takens, cusp, generalised Hopf (Bautin) and zero-Hopf points.
- **Model types:**
  - maps, with cobweb and orbit diagrams;
  - Wiener noise (SDEs) and Markov variables;
  - stiff solver (Rosenbrock 2(3));
  - periodic variables and tables;
  - arrays and Volterra integral equations;
  - delay equations, with stability from the characteristic roots;
  - global flags (events).
- **Export:** every view as SVG, and trajectories, bifurcation branches and two-parameter curves as CSV. **Write state** writes the current parameters, initial conditions and settings back into the `.ode` file.

## Using it

Open `index.html` in any recent browser, or use the GitHub Pages link above. Choose a model from the **Model** menu or paste or open your own `.ode` file in the **Equations** tab. The `examples/` folder has the example models as `.ode` files.

A 22-page introduction and tutorial is in [`docs/xpp_studio_intro-2.pdf`](docs/xpp_studio_intro-2.pdf). Its LaTeX source is in `docs/tutorial/` and can be uploaded to Overleaf.

## Credits

XPP Studio is inspired by, and reads the model files of, XPPAUT by G. Bard Ermentrout (University of Pittsburgh). Its continuation methods follow the ideas of AUTO (E. J. Doedel and colleagues) and MatCont. No XPPAUT or AUTO source code is included.

This version (October 2026) was created by Peter Ashwin and Bard Ermentrout in collaboration with Claude Opus 5.5 (Anthropic).

## Licence

GNU General Public License, version 3 or later. See [LICENSE.txt](LICENSE.txt).
