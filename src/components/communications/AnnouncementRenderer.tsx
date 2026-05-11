/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnnouncementBlock, CompanyAnnouncement } from '@/types/database';
import { ChevronLeft, ChevronRight, Download, FileText, GalleryHorizontal, Search, X, ZoomIn } from 'lucide-react';
import { proxifyMediaUrl } from '@/lib/media-proxy';

// ---------------------------------------------------------------------------
// PDF Page Slider
// ---------------------------------------------------------------------------

function PdfZoomOverlay({
  src,
  pageLabel,
  onClose,
}: {
  src: string;
  pageLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="pdf-zoom-overlay" role="dialog" aria-modal="true" aria-label={`Zoom — ${pageLabel}`}>
      <div className="pdf-zoom-backdrop" onClick={onClose} />
      <div className="pdf-zoom-frame">
        <button type="button" className="pdf-zoom-close" onClick={onClose} aria-label="Close zoom">
          <X size={20} />
        </button>
        <img src={src} alt={pageLabel} className="pdf-zoom-img" />
        <div className="pdf-zoom-label">{pageLabel}</div>
      </div>
    </div>
  );
}

function PdfPageSlider({
  heading,
  body,
  fileName,
  fileUrl,
  previewImages,
}: {
  heading?: string | null;
  body?: string | null;
  fileName?: string | null;
  fileUrl: string;
  previewImages: string[];
}) {
  const [index, setIndex] = useState(0);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [generatedPreviewImages, setGeneratedPreviewImages] = useState<string[]>([]);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    previewImages.length > 0 ? 'ready' : 'idle',
  );

  const resolvedFileUrl = useMemo(() => proxifyMediaUrl(fileUrl), [fileUrl]);
  const effectivePreviewImages = generatedPreviewImages.length > 0 ? generatedPreviewImages : previewImages;
  const activeImage = effectivePreviewImages[index];
  const total = effectivePreviewImages.length;
  const pageLabel = `${fileName || 'PDF'} · Page ${index + 1} of ${total}`;

  const goLeft = () => setIndex((i) => (i === 0 ? total - 1 : i - 1));
  const goRight = () => setIndex((i) => (i === total - 1 ? 0 : i + 1));

  useEffect(() => {
    if (previewImages.length > 0) {
      setGeneratedPreviewImages([]);
      setPreviewStatus('ready');
      return;
    }

    let cancelled = false;

    const buildFallbackPreview = async () => {
      setPreviewStatus('loading');
      try {
        const response = await fetch(resolvedFileUrl, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF (${response.status})`);
        }

        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

        const pdf = await pdfjs.getDocument({
          data: await response.arrayBuffer(),
        }).promise;

        const images: string[] = [];
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('Unable to render preview.');
          }

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvas, canvasContext: context, viewport }).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.9));
        }

        if (!cancelled) {
          setGeneratedPreviewImages(images);
          setPreviewStatus(images.length > 0 ? 'ready' : 'error');
        }
      } catch {
        if (!cancelled) {
          setGeneratedPreviewImages([]);
          setPreviewStatus('error');
        }
      }
    };

    void buildFallbackPreview();

    return () => {
      cancelled = true;
    };
  }, [previewImages.length, resolvedFileUrl]);

  useEffect(() => {
    if (index < total || total === 0) return;
    setIndex(0);
  }, [index, total]);

  return (
    <section className="announcement-pdf-block">
      <div className="announcement-pdf-head">
        <div>
          {heading ? <h3 className="announcement-block-title">{heading}</h3> : null}
          {body ? <p>{body}</p> : null}
        </div>
        <a
          className="btn btn-ghost btn-sm pdf-download-btn"
          href={resolvedFileUrl}
          download={fileName || 'document.pdf'}
          aria-label={`Download ${fileName || 'PDF'}`}
        >
          <Download size={15} />
          Download
        </a>
      </div>

      {total === 0 ? (
        <div className="announcement-media-placeholder">
          <FileText size={22} />
          <span>
            {previewStatus === 'loading'
              ? 'Generating the PDF preview now. The document is still available to open or download.'
              : 'The preview could not be generated, but the PDF is still available to open or download.'}
          </span>
        </div>
      ) : (
        <>
          <div className="pdf-slider-frame">
            <img
              src={proxifyMediaUrl(activeImage)}
              alt={pageLabel}
              className="pdf-slider-image"
            />

            {/* Zoom button */}
            <button
              type="button"
              className="pdf-slider-zoom-btn"
              onClick={() => setZoomedSrc(proxifyMediaUrl(activeImage))}
              aria-label={`Zoom page ${index + 1}`}
            >
              <ZoomIn size={16} />
            </button>

            {/* Left / Right nav */}
            {total > 1 ? (
              <>
                <button
                  type="button"
                  className="announcement-slider-nav announcement-slider-nav-left"
                  onClick={goLeft}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="announcement-slider-nav announcement-slider-nav-right"
                  onClick={goRight}
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            ) : null}
          </div>

          <div className="pdf-slider-footer">
            <span className="pdf-slider-label">{pageLabel}</span>
            {total > 1 ? (
              <div className="announcement-slider-dots">
                {effectivePreviewImages.map((_, dotIndex) => (
                  <button
                    key={dotIndex}
                    type="button"
                    className={`announcement-slider-dot ${dotIndex === index ? 'announcement-slider-dot-active' : ''}`}
                    onClick={() => setIndex(dotIndex)}
                    aria-label={`Go to page ${dotIndex + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Zoom overlay */}
      {zoomedSrc ? (
        <PdfZoomOverlay src={zoomedSrc} pageLabel={pageLabel} onClose={() => setZoomedSrc(null)} />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Image Slider (unchanged, pulled out for clarity)
// ---------------------------------------------------------------------------

function AnnouncementSlider({
  title,
  slides,
}: {
  title?: string | null;
  slides: Array<{ id?: string; imageUrl: string; caption?: string | null; body?: string | null }>;
}) {
  const validSlides = slides.filter((s) => !!s.imageUrl);
  const [index, setIndex] = useState(0);

  if (index >= validSlides.length && validSlides.length > 0) {
    setIndex(0);
  }

  const activeSlide = validSlides[index] ?? validSlides[0];

  if (validSlides.length === 0) {
    return (
      <section className="announcement-slider-block">
        {title ? <h3 className="announcement-block-title">{title}</h3> : null}
        <div className="announcement-media-placeholder">
          <GalleryHorizontal size={22} />
          <span>Add images to this slider to see the preview.</span>
        </div>
      </section>
    );
  }

  if (!activeSlide) return null;

  return (
    <section className="announcement-slider-block">
      {title ? <h3 className="announcement-block-title">{title}</h3> : null}
      <div className="announcement-slider-frame">
        <img src={proxifyMediaUrl(activeSlide.imageUrl)} alt={activeSlide.caption || 'Announcement slide'} className="announcement-slider-image" />
        {validSlides.length > 1 ? (
          <>
            <button
              type="button"
              className="announcement-slider-nav announcement-slider-nav-left"
              onClick={() => setIndex((current) => (current === 0 ? validSlides.length - 1 : current - 1))}
              aria-label="Previous slide"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="announcement-slider-nav announcement-slider-nav-right"
              onClick={() => setIndex((current) => (current === validSlides.length - 1 ? 0 : current + 1))}
              aria-label="Next slide"
            >
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>
      {(activeSlide.caption || activeSlide.body) ? (
        <div className="announcement-media-copy">
          {activeSlide.caption ? <div className="announcement-media-caption">{activeSlide.caption}</div> : null}
          {activeSlide.body ? <p>{activeSlide.body}</p> : null}
        </div>
      ) : null}
      {validSlides.length > 1 ? (
        <div className="announcement-slider-dots">
          {validSlides.map((slide, slideIndex) => (
            <button
              key={slide.id || `slide-${slideIndex}`}
              type="button"
              className={`announcement-slider-dot ${slideIndex === index ? 'announcement-slider-dot-active' : ''}`}
              onClick={() => setIndex(slideIndex)}
              aria-label={`Go to slide ${slideIndex + 1}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Block renderer
// ---------------------------------------------------------------------------

function renderBlock(block: AnnouncementBlock) {
  switch (block.type) {
    case 'text':
      return (
        <section key={block.id} className="announcement-text-block">
          {block.heading ? <h3 className="announcement-block-title">{block.heading}</h3> : null}
          <p>{block.body || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No text added yet.</span>}</p>
        </section>
      );

    case 'image':
      return (
        <section key={block.id} className="announcement-image-block">
          {block.heading ? <h3 className="announcement-block-title">{block.heading}</h3> : null}
          <div className="announcement-image-shell">
            {block.imageUrl ? (
              <img src={proxifyMediaUrl(block.imageUrl)} alt={block.caption || block.heading || 'Announcement image'} className="announcement-inline-image" />
            ) : (
              <div className="announcement-media-placeholder">
                <GalleryHorizontal size={22} />
                <span>Upload an image to see the preview here.</span>
              </div>
            )}
          </div>
          {(block.caption || block.body) ? (
            <div className="announcement-media-copy">
              {block.caption ? <div className="announcement-media-caption">{block.caption}</div> : null}
              {block.body ? <p>{block.body}</p> : null}
            </div>
          ) : null}
        </section>
      );

    case 'slider':
      return <AnnouncementSlider key={block.id} title={block.heading} slides={block.slides} />;

    case 'pdf':
      if (!block.fileUrl) {
        return (
          <section key={block.id} className="announcement-pdf-block">
            {block.heading ? <h3 className="announcement-block-title">{block.heading}</h3> : null}
            <div className="announcement-media-placeholder">
              <FileText size={22} />
              <span>Upload a PDF to enable the viewer and page preview.</span>
            </div>
          </section>
        );
      }
      return (
        <PdfPageSlider
          key={block.id}
          heading={block.heading}
          body={block.body}
          fileName={block.fileName}
          fileUrl={block.fileUrl}
          previewImages={block.previewImages ?? []}
        />
      );

    case 'gif':
      return (
        <section key={block.id} className="announcement-gif-block">
          {block.heading ? <h3 className="announcement-block-title">{block.heading}</h3> : null}
          {block.gifUrl ? (
            <div className="announcement-gif-shell">
              <img src={block.gifUrl} alt={block.caption || block.heading || 'GIF'} className="announcement-gif-image" />
            </div>
          ) : (
            <div className="announcement-media-placeholder">
              <Search size={22} />
              <span>Search and select a GIF to display it here.</span>
            </div>
          )}
          {block.caption ? <div className="announcement-media-copy"><div className="announcement-media-caption">{block.caption}</div></div> : null}
        </section>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export function AnnouncementRenderer({
  announcement,
  showCover = false,
}: {
  announcement: CompanyAnnouncement;
  showCover?: boolean;
}) {
  return (
    <div className="announcement-renderer">
      {showCover && announcement.cover_image_url ? (
        <div className="announcement-hero-image-shell">
          <img src={proxifyMediaUrl(announcement.cover_image_url)} alt={announcement.title} className="announcement-hero-image" />
        </div>
      ) : null}

      {announcement.excerpt ? <p className="announcement-excerpt">{announcement.excerpt}</p> : null}

      <div className="announcement-blocks">
        {announcement.content.length > 0 ? (
          announcement.content.map((block) => renderBlock(block))
        ) : (
          <div className="announcement-empty-body">
            <GalleryHorizontal size={18} />
            <span>No content blocks were added to this announcement.</span>
          </div>
        )}
      </div>

      <style>{`
        .announcement-renderer {
          display: grid;
          gap: 1.35rem;
        }

        .announcement-excerpt {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.7;
          font-size: 1rem;
        }

        .announcement-blocks {
          display: grid;
          gap: 1rem;
        }

        .announcement-text-block,
        .announcement-image-block,
        .announcement-pdf-block,
        .announcement-slider-block,
        .announcement-gif-block {
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          background: rgba(12, 16, 30, 0.8);
          padding: 1.1rem;
          box-shadow: 0 18px 40px rgba(3, 8, 18, 0.25);
        }

        .announcement-block-title {
          margin: 0 0 0.7rem;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .announcement-text-block p,
        .announcement-pdf-block p,
        .announcement-media-copy p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.7;
        }

        /* ---- Image shell ---- */
        .announcement-image-shell,
        .announcement-slider-frame,
        .announcement-hero-image-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 36%),
            linear-gradient(140deg, rgba(14, 22, 42, 0.98), rgba(9, 13, 26, 0.98));
        }

        .announcement-inline-image,
        .announcement-slider-image {
          display: block;
          width: 100%;
          height: 100%;
          max-height: clamp(240px, 68vh, 760px);
          object-fit: contain;
          background: rgba(255, 255, 255, 0.96);
        }

        .announcement-image-shell,
        .announcement-slider-frame {
          min-height: clamp(240px, 48vh, 560px);
          max-height: clamp(240px, 68vh, 760px);
          padding: clamp(0.5rem, 1.5vw, 0.9rem);
        }

        /* ---- Hero image — viewport-relative so portrait images don't fill the screen ---- */
        .announcement-hero-image-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          max-height: clamp(220px, 50vh, 520px);
        }

        .announcement-hero-image {
          display: block;
          width: 100%;
          height: 100%;
          max-height: clamp(220px, 50vh, 520px);
          object-fit: contain;
        }

        .announcement-media-copy {
          margin-top: 0.9rem;
          display: grid;
          gap: 0.35rem;
        }

        .announcement-media-caption {
          color: var(--text-primary);
          font-size: 0.88rem;
          font-weight: 700;
        }

        /* ---- Slider nav ---- */
        .announcement-slider-frame {
          position: relative;
        }

        .announcement-slider-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(8, 12, 26, 0.74);
          color: var(--text-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease;
        }

        .announcement-slider-nav:hover {
          transform: translateY(-50%) scale(1.04);
          background: rgba(20, 30, 58, 0.92);
        }

        .announcement-slider-nav-left { left: 0.85rem; }
        .announcement-slider-nav-right { right: 0.85rem; }

        .announcement-slider-dots {
          display: flex;
          gap: 0.45rem;
          justify-content: center;
          margin-top: 0.85rem;
        }

        .announcement-slider-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          border: none;
          background: rgba(148, 163, 184, 0.32);
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease;
        }

        .announcement-slider-dot-active {
          background: var(--brand-accent-light);
          transform: scale(1.15);
        }

        /* ---- PDF Slider ---- */
        .announcement-pdf-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.85rem;
        }

        .pdf-download-btn {
          flex-shrink: 0;
        }

        .pdf-slider-frame {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }

        .pdf-slider-image {
          display: block;
          width: 100%;
          height: auto;
          max-height: clamp(320px, 65vh, 860px);
          object-fit: contain;
          background: #fff;
        }

        .pdf-slider-zoom-btn {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(8, 12, 26, 0.78);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease;
          z-index: 2;
        }

        .pdf-slider-zoom-btn:hover {
          transform: scale(1.08);
          background: rgba(99, 102, 241, 0.72);
        }

        .pdf-slider-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          margin-top: 0.75rem;
        }

        .pdf-slider-label {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        /* ---- PDF Zoom Overlay ---- */
        .pdf-zoom-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }

        .pdf-zoom-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(3, 6, 18, 0.88);
          backdrop-filter: blur(8px);
        }

        .pdf-zoom-frame {
          position: relative;
          max-width: min(90vw, 960px);
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          z-index: 1;
        }

        .pdf-zoom-img {
          display: block;
          max-width: 100%;
          max-height: calc(90vh - 4rem);
          object-fit: contain;
          border-radius: 16px;
          box-shadow: 0 40px 80px rgba(0, 0, 0, 0.6);
        }

        .pdf-zoom-close {
          position: absolute;
          top: -0.5rem;
          right: -0.5rem;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(15, 20, 40, 0.92);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s ease;
          z-index: 2;
        }

        .pdf-zoom-close:hover {
          background: rgba(239, 68, 68, 0.6);
        }

        .pdf-zoom-label {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
        }

        /* ---- GIF Block ---- */
        .announcement-gif-shell {
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .announcement-gif-image {
          display: block;
          max-width: 100%;
          max-height: clamp(200px, 45vh, 480px);
          object-fit: contain;
          border-radius: 20px;
        }

        /* ---- Misc ---- */
        .announcement-empty-body {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: var(--text-muted);
        }

        .announcement-media-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 2rem 1rem;
          border-radius: 16px;
          border: 2px dashed rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          font-size: 0.85rem;
          text-align: center;
          min-height: 100px;
        }

        @media (max-width: 720px) {
          .announcement-pdf-head {
            flex-direction: column;
          }
          .announcement-slider-nav {
            width: 38px;
            height: 38px;
          }
          .pdf-zoom-overlay {
            padding: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
