import { LitElement, html } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement, property } from 'lit/decorators.js';
import Worker from './sketcher.worker.ts';
import JSZip from 'jszip';
import style from './index.css';

const worker = new Worker();

const SUPPORTED_EXTENSIONS = ['.fa', '.fasta', '.fna', '.gz', '.fq', '.fastq'];

@customElement('mgnify-sourmash-component')
export class MGnifySourmash extends LitElement {
  @property({ type: Boolean, reflect: true })
  directory = false;
  @property({ type: Boolean })
  show_directory_checkbox = false;
  @property({ type: Boolean })
  show_signatures = false;

  // KmerMinHash parameters
  @property({ type: Number }) num = 0;
  @property({ type: Number }) ksize = 31;
  @property({ type: Boolean }) is_protein = false;
  @property({ type: Boolean }) dayhoff = false;
  @property({ type: Boolean }) hp = false;
  @property({ type: Number }) seed = 42;
  @property({ type: Number }) scaled = 1000;
  @property({ type: Boolean }) track_abundance = false;

  selectedFiles: Array<File> = null;
  progress: { [filename: string]: number } = {};
  signatures: { [filename: string]: string } = {};
  errors: { [filename: string]: string } = {};

  static styles = [style];

  constructor() {
    super();
    this.initWorker();
  }

  initWorker() {
    worker.addEventListener('message', (event) => {
      switch (event?.data?.type) {
        case 'progress:read':
          this.progress[event.data.filename] = event.data.progress;
          this.requestUpdate();
          break;
        case 'signature:error':
          this.errors[event.data.filename] = event.data.error;
          this.requestUpdate();
          break;
        case 'signature:generated':
          this.signatures[event.data.filename] = event.data.signature;
          this.progress[event.data.filename] = 100;
          this.requestUpdate();
          break;
        default:
          break;
      }
    });
  }

  private haveCompletedAllSignatures() {
    return Object.keys(this.progress).every(
      (key: string) => key in this.signatures || key in this.errors
    );
  }

  handleFileChanges(event: InputEvent) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.selectedFiles = Array.from(input.files).filter((file: File) => {
        return SUPPORTED_EXTENSIONS.some((ext) => file.name.endsWith(ext));
      });
      this.requestUpdate();
    }
  }

  // Start sketching after clicking the Start button
  startSketching() {
    if (!this.selectedFiles?.length) {
      alert('Please select files before starting sketching.');
      return;
    }

    worker.postMessage({
      files: this.selectedFiles,
      options: {
        num: this.num,
        ksize: this.ksize,
        is_protein: this.is_protein,
        dayhoff: this.dayhoff,
        hp: this.hp,
        seed: this.seed,
        scaled: this.scaled,
        track_abundance: this.track_abundance,
      },
    });
  }

  clearSession() {
    this.selectedFiles = [];
    this.progress = {};
    this.signatures = {};
    this.errors = {};
    this.requestUpdate();
  }

  downloadAllSketches() {
    const zip = new JSZip();
    Object.entries(this.signatures).forEach(([filename, signature]) => {
      const basename = filename.split('.').slice(0, -1).join('.');
      zip.file(`${basename}.sig`, signature);
    });
    zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'sketches.zip';
      link.click();
    });
  }

  downloadSketch(filename: string) {
    const signature = this.signatures[filename];
    const basename = filename.split('.').slice(0, -1).join('.');
    const blob = new Blob([signature], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${basename}.sig`;
    link.click();
  }

  renderSelectedFiles() {
    if ((this.selectedFiles?.length || 0) < 1) return '';
    return html`
      <div>
        <h2>Selected Files:</h2>
        <ul>
          ${this.selectedFiles.map((file: File) => {
            const progress = this.progress?.[file.name] || 0;
            const signature = this.signatures[file.name];
            const error = this.errors[file.name];
            let emoji = html``;
            if (signature) emoji = html`✅`;
            if (error)
              emoji = html`<span title=${error}>⚠️<code>${error}</code></span>`;
            return html` <li>
              ${file.name} ${emoji}
              <progress
                id=${file.name}
                max="100"
                value=${ifDefined(progress > 100 ? undefined : progress)}
              >
                ${progress.toFixed(2)}%
              </progress>
              ${this.show_signatures && signature?.length
                ? html`
                    <details>
                      <summary>See signature</summary>
                      <pre>${signature}</pre>
                    </details>
                  `
                : ''}
            </li>`;
          })}
        </ul>
      </div>
    `;
  }

  render() {
    let label = this.directory ? 'Choose a directory...' : 'Choose Files...';
    if (this.selectedFiles?.length)
      label = `${this.selectedFiles?.length} Files Selected`;

    return html`
      <div class="mgnify-sourmash-component">
        <label
          >Select ${this.is_protein ? 'protein' : 'nucleotides'} FastA
          files:</label
        >
        <label class="file" for="sourmash-selector">
          <input
            type="file"
            id="sourmash-selector"
            name="sourmash-selector"
            accept=${SUPPORTED_EXTENSIONS.join(',')}
            @change=${this.handleFileChanges}
            ?webkitdirectory=${this.directory}
            ?multiple=${!this.directory}
          />
          <span class="file-custom" data-label=${label}></span>
        </label>
        ${this.show_directory_checkbox
          ? html`
              <div class="mode-selector">
                <button
                  class=${this.directory ? '' : 'selected'}
                  @click=${() => (this.directory = false)}
                >
                  Files
                </button>
                <button
                  class=${this.directory ? 'selected' : ''}
                  @click=${() => (this.directory = true)}
                >
                  Directory
                </button>
              </div>
            `
          : ''}
        ${this.renderSelectedFiles()}

        <button @click=${this.startSketching}>Start Sketching</button>
        <button @click=${this.clearSession}>Clear</button>

        ${Object.keys(this.signatures).length > 0
          ? html`
              <button @click=${this.downloadAllSketches}>Download All as Zip</button>
              <ul>
                ${Object.keys(this.signatures).map(
                  (filename) => html`
                    <li>
                      <button @click=${() => this.downloadSketch(filename)}>
                        Download ${filename}
                      </button>
                    </li>
                  `
                )}
              </ul>
            `
          : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mgnify-sourmash-component': MGnifySourmash;
  }
}
