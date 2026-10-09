import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PdfUpload } from './pdf-upload/pdf-upload';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PdfUpload],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('pdf-chatbot-ui');
}
