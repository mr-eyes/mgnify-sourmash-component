import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Import JSZip
import JSZip from 'jszip';

// Import the worker
import SketcherWorker from './sketcher.worker.ts';

// Import Bootstrap CSS
import 'bootstrap/dist/css/bootstrap.min.css';

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.fa', '.fasta', '.fna', '.gz', '.fq', '.fastq'];

@customElement('mgnify-sourmash-component')
export class MGnifySourmash extends LitElement {
  @property({ type: Boolean })
  directory = false;

  @property({ type: Boolean })
  show_directory_checkbox = false;

  @property({ type: Boolean })
  show_signatures = false;

  // KmerMinHash parameters
  @property({ type: Number })
  num = 0;

  @property({ type: Number })
  ksize = 51;

  @property({ type: Boolean })
  is_protein = false;

  @property({ type: Boolean })
  dayhoff = false;

  @property({ type: Boolean })
  hp = false;

  @property({ type: Number })
  seed = 42;

  @property({ type: Number })
  scaled = 10000;

  @property({ type: Boolean })
  track_abundance = true;

  selectedFiles: Array<File> = [];
  progress: { [filename: string]: number } = {};
  signatures: { [filename: string]: string } = {};
  errors: { [filename: string]: string } = {};

  static styles = css`
    /* Your custom styles here */
    .file-input {
      margin-bottom: 20px;
    }
  `;

  private worker: Worker;

  constructor() {
    super();
    this.initWorker();
  }

  initWorker() {
    this.worker = new SketcherWorker();

    this.worker.addEventListener('message', (event) => {
      switch (event?.data?.type) {
        case 'progress:read':
          this.progress[event.data.filename] = event.data.progress;
          this.requestUpdate();
          break;
        case 'signature:error':
          this.errors[event.data.filename] = event.data.error;
          this.dispatchEvent(
            new CustomEvent('sketchedError', {
              bubbles: true,
              detail: {
                filename: event.data.filename,
                error: event.data.error,
              },
            })
          );
          this.requestUpdate();
          break;
        case 'signature:generated':
          this.signatures[event.data.filename] = event.data.signature;
          this.progress[event.data.filename] = 100;
          this.dispatchEvent(
            new CustomEvent('sketched', {
              bubbles: true,
              detail: {
                filename: event.data.filename,
                signature: event.data.signature,
              },
            })
          );
          if (this.haveCompletedAllSignatures()) {
            this.dispatchEvent(
              new CustomEvent('sketchedall', {
                bubbles: true,
                detail: {
                  signatures: this.signatures,
                  errors: this.errors,
                },
              })
            );
          }
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

  handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.selectedFiles = Array.from(input.files).filter((file: File) => {
        for (const ext of SUPPORTED_EXTENSIONS) {
          if (file.name.endsWith(ext)) {
            return true;
          }
        }
        return false;
      });

      this.startSketching();
    }
  }

  startSketching() {
    this.progress = {};
    this.signatures = {};
    this.errors = {};

    this.worker.postMessage({
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

    this.requestUpdate();
  }

  clearSketches() {
    this.selectedFiles = [];
    this.progress = {};
    this.signatures = {};
    this.errors = {};
    this.requestUpdate();
  }

  downloadAllSketches() {
    const zip = new JSZip();
    for (const [filename, signature] of Object.entries(this.signatures)) {
      const basename = filename.split('.').slice(0, -1).join('.');
      const sketchFilename = `${basename}.sig`;
      zip.file(sketchFilename, signature);
    }
    zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'sketches.zip';
      link.click();
    });
  }

  downloadSketch(filename: string) {
    const basename = filename.split('.').slice(0, -1).join('.');
    const sketchFilename = `${basename}.sig`;
    const blob = new Blob([this.signatures[filename]], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = sketchFilename;
    link.click();
  }

  handleScaledChange(event: InputEvent) {
    this.scaled = Number((event.target as HTMLInputElement).value);
  }

  handleKsizeChange(event: InputEvent) {
    this.ksize = Number((event.target as HTMLInputElement).value);
  }

  handleTrackAbundanceChange(event: InputEvent) {
    this.track_abundance = (event.target as HTMLInputElement).checked;
  }

  render() {
    return html`
      <div class="card">
        <div class="card-body">
          <!-- File/Directory Selection -->
          <form id="sketchForm">
            <div class="mb-3">
              <label for="fileInput" class="form-label">Select Files or Directory</label>
              <input
                type="file"
                class="form-control"
                id="fileInput"
                @change="${this.handleFileInput}"
                ?webkitdirectory="${this.directory}"
                ?directory="${this.directory}"
                multiple
              />
              <div class="form-text">
                You can select multiple files, a single file, or a directory.
              </div>
            </div>
            <!-- Parameters -->
            <div class="row">
              <div class="col-md-4">
                <label for="scaled" class="form-label">Scaled</label>
                <input
                  type="number"
                  class="form-control"
                  id="scaled"
                  .value="${this.scaled}"
                  @input="${this.handleScaledChange}"
                />
              </div>
              <div class="col-md-4">
                <label for="ksize" class="form-label">Ksize</label>
                <input
                  type="number"
                  class="form-control"
                  id="ksize"
                  .value="${this.ksize}"
                  @input="${this.handleKsizeChange}"
                />
              </div>
              <div class="col-md-4">
                <label class="form-label">Track Abundance</label>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="trackAbundance"
                    ?checked="${this.track_abundance}"
                    @change="${this.handleTrackAbundanceChange}"
                  />
                  <label class="form-check-label" for="trackAbundance">Enable</label>
                </div>
              </div>
            </div>
            <!-- Buttons -->
            <div class="d-flex justify-content-between mt-4">
              <button
                type="button"
                class="btn btn-primary"
                @click="${this.startSketching}"
                ?disabled="${this.selectedFiles.length === 0}"
              >
                Start Sketching
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                @click="${this.clearSketches}"
                ?disabled="${this.selectedFiles.length === 0}"
              >
                Clear Sketches
              </button>
            </div>
          </form>
          <!-- Progress Section -->
          ${Object.keys(this.progress).length > 0
            ? html`
                <div id="progressSection" class="mt-4">
                  <h5>Progress</h5>
                  <div id="progressContainer">
                    ${Object.keys(this.progress).map(
                      (filename) => html`
                        <div class="mb-2">
                          <div>${filename}</div>
                          <div class="progress">
                            <div
                              class="progress-bar"
                              role="progressbar"
                              style="width: ${this.progress[filename]}%;"
                              aria-valuenow="${this.progress[filename]}"
                              aria-valuemin="0"
                              aria-valuemax="100"
                            ></div>
                          </div>
                          ${this.errors[filename]
                            ? html`<div class="text-danger">${this.errors[filename]}</div>`
                            : ''}
                        </div>
                      `
                    )}
                  </div>
                </div>
              `
            : ''}
          <!-- Download Buttons -->
          ${Object.keys(this.signatures).length > 0
            ? html`
                <div id="downloadSection" class="mt-4">
                  <h5>Download Sketches</h5>
                  <button type="button" class="btn btn-success" @click="${this.downloadAllSketches}">
                    Download All as Zip
                  </button>
                  <div id="individualDownloads" class="mt-2">
                    ${Object.keys(this.signatures).map(
                      (filename) => html`
                        <button
                          type="button"
                          class="btn btn-link"
                          @click="${() => this.downloadSketch(filename)}"
                        >
                          Download ${filename}
                        </button>
                      `
                    )}
                  </div>
                </div>
              `
            : ''}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mgnify-sourmash-component': MGnifySourmash;
  }
}
