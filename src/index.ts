import { LitElement, html, css, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import Worker from './sketcher.worker.ts';
import JSZip from 'jszip';
import style from './index.css';

const worker = new Worker();
const SUPPORTED_EXTENSIONS = ['.fa', '.fasta', '.fna', '.gz', '.fq', '.fastq'];


@customElement('snipe-sourmash-component')
export class MGnifySourmash extends LitElement {
  @property({ type: Boolean, reflect: true })
  directory = false;

  @property({ type: Boolean })
  show_directory_checkbox = false;

  @property({ type: Boolean })
  show_signatures = false;

  // KmerMinHash parameters
  @property({ type: Number }) num = 0;
  @property({ type: Number }) ksize = 51;
  @property({ type: Boolean }) is_protein = false;
  @property({ type: Boolean }) dayhoff = false;
  @property({ type: Boolean }) hp = false;
  @property({ type: Number }) seed = 42;
  @property({ type: Number }) scaled = 10000;
  @property({ type: Boolean }) track_abundance = true;

  selectedFiles: Array<File> = [];
  progress: { [filename: string]: number } = {};
  signatures: { [filename: string]: string } = {};
  errors: { [filename: string]: string } = {};


  // load unsafeCSS from lit to avoid security issues
  // static styles = [unsafeCSS(style)]; 

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

  handleFileChanges(event: InputEvent) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.selectedFiles = Array.from(input.files).filter((file: File) =>
        SUPPORTED_EXTENSIONS.some((ext) => file.name.endsWith(ext))
      );
      this.requestUpdate();
    }
  }

  handleInputChange<T extends keyof MGnifySourmash>(event: InputEvent, key: T) {
    const input = event.target as HTMLInputElement;
    this[key] = input.type === 'checkbox' ? (input.checked as any) : (Number(input.value) as any);
  }

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
        <ul class="list-group">
          ${this.selectedFiles.map((file: File) => {
            const progress = this.progress?.[file.name] || 0;
            const signature = this.signatures[file.name];
            const error = this.errors[file.name];
            let statusIcon = '';
            if (signature) statusIcon = '✅';
            if (error) statusIcon = `⚠️`;

            return html`
              <li class="list-group-item">
                <div class="d-flex justify-content-between align-items-center">
                  <!-- File name and status icon -->
                  <h6 class="mb-0 w-25">${file.name} ${statusIcon}</h6>

                  <!-- Progress bar -->
                  <div class="progress w-50 mx-2">
                    <div
                      class="progress-bar"
                      role="progressbar"
                      style="width: ${progress}%;"
                      aria-valuenow="${progress}"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>

                  <!-- Download button -->
                  <button
                    class="btn btn-outline-primary btn-sm"
                    @click=${() => this.downloadSketch(file.name)}
                    ?disabled=${progress < 100}
                  >
                    Download
                  </button>
                </div>

                <!-- Error message, if any -->
                ${error
                  ? html`<div class="alert alert-danger mt-2" role="alert">${error}</div>`
                  : ''}

                <!-- Signature details, if any -->
                ${this.show_signatures && signature?.length
                  ? html`
                      <details>
                        <summary>See signature</summary>
                        <pre>${signature}</pre>
                      </details>
                    `
                  : ''}
              </li>
            `;
          })}
        </ul>
      </div>
    `;
}


render() {
  return html`
    <style>
      ${style}
    </style>
    <body class="container snipe-sourmash-component py-5">
      <div class="container" style="max-width: 800px;">
        <h1 class="text-center mb-4">WebSketch Dashboard</h1>
        <div class="card">
          <div class="card-body">
            <!-- File input -->
            <div class="mb-3">
              <label for="file-input" class="form-label">Select Files:</label>
              <input
                class="form-control"
                type="file"
                id="file-input"
                @change=${this.handleFileChanges}
                multiple
                accept=${SUPPORTED_EXTENSIONS.join(',')}
              />
            </div>

            <!-- Folder input -->
            <div class="mb-3">
              <label for="folder-input" class="form-label">Select Folder:</label>
              <input
                class="form-control"
                type="file"
                id="folder-input"
                webkitdirectory
                @change=${this.handleFileChanges}
              />
            </div>

            <!-- Input controls for ksize, scaled, and track_abundance -->
            <div class="row mb-3">
              <div class="col-md-4">
                <label for="ksize" class="form-label">K-size:</label>
                <input
                  type="number"
                  id="ksize"
                  class="form-control"
                  .value="${this.ksize}"
                  @input=${(e: InputEvent) => this.handleInputChange(e, 'ksize')}
                />
              </div>
              <div class="col-md-4">
                <label for="scaled" class="form-label">Scaled:</label>
                <input
                  type="number"
                  id="scaled"
                  class="form-control"
                  .value="${this.scaled}"
                  @input=${(e: InputEvent) => this.handleInputChange(e, 'scaled')}
                />
              </div>
              <div class="col-md-4">
                <div class="form-check mt-4">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="track-abundance"
                    .checked="${this.track_abundance}"
                    @input=${(e: InputEvent) => this.handleInputChange(e, 'track_abundance')}
                  />
                  <label class="form-check-label" for="track-abundance">
                    Track Abundance
                  </label>
                </div>
              </div>
            </div>

            <!-- Buttons -->
            <div class="d-flex justify-content-between mt-4">
              <button class="btn btn-primary" @click=${this.startSketching}>Start Sketching</button>
              <button class="btn btn-secondary ms-2" @click=${this.clearSession}>Clear</button>
              ${Object.keys(this.signatures).length > 0
                ? html`
                    <button class="btn btn-success ms-2" @click=${this.downloadAllSketches}>
                      Download All as Zip
                    </button>
                  `
                : ''}
            </div>

            <!-- List of individual downloads -->
            ${this.renderSelectedFiles()}
          </div>
        </div>
      </div>
    </body>
  `;
}
}


declare global {
  interface HTMLElementTagNameMap {
    'snipe-sourmash-component': MGnifySourmash;
  }
}