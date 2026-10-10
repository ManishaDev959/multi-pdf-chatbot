import { Component, DestroyRef, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
// import { environment } from '../../environments/environment.development';
import { environment } from '../../environments/environment';
interface UploadedFile {
  file: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
}

interface SearchResult {
  text: string;
  source: string;
  page: number;
}

@Component({
  selector: 'app-pdf-upload',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './pdf-upload.html',
  styleUrl: './pdf-upload.css',
})
export class PdfUpload {
  selectedFiles: File[] = [];
  uploadedFiles = signal<UploadedFile[]>([]);
  searchResults = signal<SearchResult[]>([]);
  message = signal('');
  messageType = signal<'info' | 'success' | 'error' | ''>('');
  question = '';
  questionMessage = signal('');
  questionMessageType = signal<'info' | 'error' | ''>('');
  loading = signal(false);
  searching = signal(false);
  private statusSubscription?: Subscription;
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private destroyRef: DestroyRef) {}

  get hasReadyFiles() {
    return this.uploadedFiles().some((file) => file.status === 'ready');
  }

  get indexing() {
    return this.uploadedFiles().some((file) => file.status === 'processing');
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFiles = Array.from(input.files ?? []);
    this.message.set('');
    this.messageType.set('');
  }

  upload() {
    if (this.selectedFiles.length === 0) return;

    this.statusSubscription?.unsubscribe();
    const formData = new FormData();
    this.selectedFiles.forEach((file) => formData.append('files', file));

    this.uploadedFiles.set([]);
    this.searchResults.set([]);
    this.questionMessage.set('');
    this.questionMessageType.set('');
    this.message.set('');
    this.messageType.set('');
    this.loading.set(true);
    // this.http.post<UploadedFile[]>('http://localhost:8000/upload', formData)
    this.http.post<UploadedFile[]>(`${environment.apiUrl}/upload`, formData)
      .subscribe({
        next: (files) => {
          this.uploadedFiles.set(files);
          this.loading.set(false);
          this.message.set(`Uploaded to the backend. Preparing ${files.map((file) => file.file).join(', ')} for questions…`);
          this.messageType.set('info');
          this.checkIndexingStatus(files.map((file) => file.file));
        },
        error: () => {
          this.message.set('Upload failed. Is the backend running?');
          this.messageType.set('error');
          this.loading.set(false);
        },
      });
  }

  private checkIndexingStatus(filenames: string[]) {
    this.statusSubscription = timer(0, 1500).pipe(
      // switchMap(() => this.http.get<UploadedFile[]>('http://localhost:8000/upload/status', {
      switchMap(() => this.http.get<UploadedFile[]>(`${environment.apiUrl}/upload/status`, {
        params: { files: filenames },
      })),
      takeWhile((files) => files.some((file) => file.status === 'processing'), true),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (files) => {
        this.uploadedFiles.set(files);
        if (files.every((file) => file.status !== 'processing')) {
          const readyCount = files.filter((file) => file.status === 'ready').length;
          const failedFiles = files.filter((file) => file.status === 'failed');
          if (failedFiles.length > 0) {
            const failedNames = failedFiles.map((file) => file.file).join(', ');
            this.message.set(readyCount > 0
              ? `Some PDFs could not be prepared: ${failedNames}. You can ask questions about the other uploaded PDFs.`
              : `PDF upload completed, but indexing failed for: ${failedNames}.`);
            this.messageType.set('error');
          } else {
            this.message.set(`${readyCount} ${readyCount === 1 ? 'PDF is' : 'PDFs are'} ready for questions.`);
            this.messageType.set('success');
          }
        }
      },
      error: (error: HttpErrorResponse) => {
        this.uploadedFiles.set(filenames.map((file) => ({
          file,
          status: 'failed',
          error: 'Could not retrieve upload status from the backend.',
        })));
        this.message.set(error.status === 404
          ? 'The running backend does not have the upload status endpoint. Restart the updated backend and upload the PDF again.'
          : 'PDF uploaded, but indexing status could not be checked. Please check the backend and try again.');
        this.messageType.set('error');
      },
    });
  }

  askQuestion() {
    const question = this.question.trim();
    if (!question || !this.hasReadyFiles || this.searching()) return;

    this.searching.set(true);
    this.searchResults.set([]);
    this.questionMessage.set('');
    this.questionMessageType.set('');
    // this.http.get<SearchResult[]>('http://localhost:8000/search', { params: { q: question } })
      this.http.get<SearchResult[]>('http://localhost:8000/search', { params: { q: question } })
      .subscribe({
        next: (results) => {
          this.searchResults.set(results);
          this.questionMessage.set(results.length ? '' : 'No relevant passages were found in the uploaded PDFs.');
          this.questionMessageType.set(results.length ? '' : 'info');
          this.searching.set(false);
        },
        error: () => {
          this.questionMessage.set('Could not get an answer. Please check that the backend is running and try again.');
          this.questionMessageType.set('error');
          this.searching.set(false);
        },
      });
  }
}