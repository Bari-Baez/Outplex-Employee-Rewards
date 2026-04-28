/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import type { AnnouncementBlock, CompanyAnnouncement } from '@/types/database';
import { ChevronLeft, ChevronRight, FileText, GalleryHorizontal } from 'lucide-react';

function AnnouncementSlider({
  title,
  slides,
}: {
  title?: string | null;
  slides: Array<{ id?: string; imageUrl: string; caption?: string | null; body?: string | null }>;
}) {
  // Filter out slides that have no image URL yet to avoid empty src=""
  const validSlides = slides.filter((s) => !!s.imageUrl);
  const [index, setIndex] = useState(0);

  // Safety: reset index if it goes out of bounds when slides are removed
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
        <img src={activeSlide.imageUrl} alt={activeSlide.caption || 'Announcement slide'} className="announcement-slider-image" />
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
              <img src={block.imageUrl} alt={block.caption || block.heading || 'Announcement image'} className="announcement-inline-image" />
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
      return (
        <section key={block.id} className="announcement-pdf-block">
          <div className="announcement-pdf-head">
            <div>
              {block.heading ? <h3 className="announcement-block-title">{block.heading}</h3> : null}
              {block.body ? <p>{block.body}</p> : null}
            </div>
            {block.fileUrl ? (
              <a className="btn btn-ghost btn-sm" href={block.fileUrl} target="_blank" rel="noreferrer">
                <FileText size={15} />
                {block.fileName || 'Open PDF'}
              </a>
            ) : null}
          </div>
          {!block.fileUrl ? (
            <div className="announcement-media-placeholder">
              <FileText size={22} />
              <span>Upload a PDF to enable the viewer and slideshow preview.</span>
            </div>
          ) : (
            <>
              {(block.displayMode === 'document' || block.displayMode === 'both') ? (
                <div className="announcement-pdf-frame">
                  <iframe src={block.fileUrl} title={block.fileName || block.heading || 'Announcement PDF'} />
                </div>
              ) : null}
              {(block.displayMode === 'slider' || block.displayMode === 'both') && (block.previewImages?.length ?? 0) > 0 ? (
                <AnnouncementSlider
                  title={block.displayMode === 'both' ? 'PDF slideshow' : block.heading}
                  slides={(block.previewImages ?? []).map((imageUrl, slideIndex) => ({
                    imageUrl,
                    caption: `${block.fileName || 'PDF'} · Page ${slideIndex + 1}`,
                  }))}
                />
              ) : (block.fileUrl && (block.displayMode === 'slider' || block.displayMode === 'both')) ? (
                <div className="announcement-media-placeholder">
                  <FileText size={22} />
                  <span>Re-upload the PDF to generate the slideshow preview pages.</span>
                </div>
              ) : null}
            </>
          )}
        </section>
      );
    default:
      return null;
  }
}

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
          <img src={announcement.cover_image_url} alt={announcement.title} className="announcement-hero-image" />
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
        .announcement-slider-block {
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

        .announcement-image-shell,
        .announcement-slider-frame,
        .announcement-hero-image-shell {
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 36%),
            linear-gradient(140deg, rgba(14, 22, 42, 0.98), rgba(9, 13, 26, 0.98));
        }

        .announcement-inline-image,
        .announcement-slider-image,
        .announcement-hero-image {
          display: block;
          width: 100%;
          height: auto;
          object-fit: cover;
        }

        .announcement-hero-image {
          max-height: 420px;
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

        .announcement-slider-nav-left {
          left: 0.85rem;
        }

        .announcement-slider-nav-right {
          right: 0.85rem;
        }

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

        .announcement-pdf-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.85rem;
        }

        .announcement-pdf-frame {
          min-height: 420px;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }

        .announcement-pdf-frame iframe {
          width: 100%;
          min-height: 420px;
          border: 0;
          background: white;
        }

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
        }
      `}</style>
    </div>
  );
}
