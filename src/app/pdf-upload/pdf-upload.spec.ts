import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PdfUpload } from './pdf-upload';

describe('PdfUpload', () => {
  let component: PdfUpload;
  let fixture: ComponentFixture<PdfUpload>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdfUpload],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PdfUpload);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => httpTesting.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should stop the upload loader when the backend accepts the PDF and track indexing separately', async () => {
    component.selectedFiles = [new File(['document'], 'report.pdf', { type: 'application/pdf' })];
    component.upload();

    expect(component.loading()).toBe(true);
    httpTesting.expectOne('http://localhost:8000/upload').flush([
      { file: 'report.pdf', status: 'processing' },
    ]);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.message()).toContain('Uploaded to the backend');
    expect(component.indexing).toBe(true);
    expect(fixture.nativeElement.querySelector('.upload-button').textContent).not.toContain('Uploading');

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpTesting.expectOne((request) =>
      request.url === 'http://localhost:8000/upload/status' &&
      request.params.get('files') === 'report.pdf',
    ).flush([{ file: 'report.pdf', status: 'ready' }]);

    expect(component.messageType()).toBe('success');
    expect(component.message()).toContain('ready for questions');
    expect(component.uploadedFiles()).toHaveLength(1);
    expect(component.hasReadyFiles).toBe(true);
  });

  it('should search uploaded PDFs for a submitted question', () => {
    component.uploadedFiles.set([{ file: 'report.pdf', status: 'ready' }]);
    component.question = 'What is the report about?';

    component.askQuestion();
    httpTesting.expectOne((request) =>
      request.url === 'http://localhost:8000/search' &&
      request.params.get('q') === 'What is the report about?',
    ).flush([
      { text: 'The report describes quarterly results.', source: 'report.pdf', page: 1 },
    ]);

    expect(component.searching()).toBe(false);
    expect(component.searchResults()[0].source).toBe('report.pdf');
    expect(component.searchResults()[0].page).toBe(1);
  });
});
