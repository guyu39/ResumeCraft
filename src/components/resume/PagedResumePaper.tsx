import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Resume } from '@/types/resume'
import ResumePreview from './ResumePreview'

// A4 in CSS pixels at 96dpi: 210mm × 297mm => 794 × 1123
export const A4_WIDTH_PX = 794
export const A4_HEIGHT_PX = 1123
const PAGE_GAP_PX = 18
const PAGE_TOP_SAFE_PX = 15
const PAGE_BOTTOM_SAFE_PX = 10
const MIN_PAGE_SLICE_PX = 220

interface PagedResumePaperProps {
    resume: Resume
    pageShadowClassName?: string
}

const PagedResumePaper: React.FC<PagedResumePaperProps> = ({
    resume,
    pageShadowClassName = 'shadow-[0_4px_24px_rgba(0,0,0,0.12)]',
}) => {
    const hiddenFullRef = useRef<HTMLDivElement>(null)
    const [pageStarts, setPageStarts] = useState<number[]>([0])
    const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX)

    const computePageStarts = (element: HTMLDivElement) => {
        const nextContentHeight = Math.max(A4_HEIGHT_PX, element.scrollHeight)

        // 内容不满一整页时强制单页显示。
        if (nextContentHeight <= A4_HEIGHT_PX) {
            setPageStarts([0])
            setContentHeight(nextContentHeight)
            return
        }

        const candidates = Array.from(
            element.querySelectorAll<HTMLElement>('[data-page-break-candidate]')
        ).filter((node) => !node.parentElement?.closest('[data-page-break-candidate]'))

        const blocks = candidates
            .map((node) => {
                const top = node.offsetTop
                const height = Math.max(node.offsetHeight, 1)
                return {
                    top,
                    bottom: top + height,
                }
            })
            .filter((block) => block.top > 0 && block.top < nextContentHeight)
            .sort((a, b) => a.top - b.top)

        const starts: number[] = [0]
        let currentStart = 0
        let pageIndex = 0

        while (currentStart < nextContentHeight) {
            const pageTopSafe = pageIndex === 0 ? 0 : PAGE_TOP_SAFE_PX
            const pageContentHeight = A4_HEIGHT_PX - pageTopSafe - PAGE_BOTTOM_SAFE_PX
            if (currentStart + pageContentHeight >= nextContentHeight) break

            const expectedEnd = currentStart + pageContentHeight
            let nextStart = expectedEnd
            let foundOverflowBlock = false

            for (let i = 0; i < blocks.length; i += 1) {
                const block = blocks[i]
                if (block.bottom <= currentStart + 1) continue
                if (block.top < currentStart + 1) continue
                if (block.bottom <= expectedEnd) continue

                foundOverflowBlock = true

                // 模块即将触底时整块移到下一页，避免从中间切开。
                if (block.top > currentStart + MIN_PAGE_SLICE_PX) {
                    nextStart = block.top
                } else {
                    // 模块本身过高或起点过早时，退化到当前页末，防止死循环。
                    nextStart = expectedEnd
                }
                break
            }

            if (!foundOverflowBlock && expectedEnd < nextContentHeight) {
                nextStart = expectedEnd
            }

            if (nextStart <= currentStart || nextStart > nextContentHeight) {
                nextStart = expectedEnd
            }

            starts.push(nextStart)
            currentStart = nextStart
            pageIndex += 1
        }

        setPageStarts(starts)
        setContentHeight(nextContentHeight)
    }

    useEffect(() => {
        const element = hiddenFullRef.current
        if (!element) return

        const updatePages = () => computePageStarts(element)

        updatePages()

        const observer = new ResizeObserver(updatePages)
        observer.observe(element)

        return () => observer.disconnect()
    }, [resume])

    const pageCount = useMemo(() => Math.max(1, pageStarts.length), [pageStarts])

    const totalVisibleHeight =
        pageCount * A4_HEIGHT_PX + Math.max(0, pageCount - 1) * PAGE_GAP_PX

    return (
        <>
            {/* 导出专用完整内容（隐藏但保留在DOM） */}
            <div
                id="resume-paper"
                ref={hiddenFullRef}
                style={{
                    position: 'absolute',
                    left: '-100000px',
                    top: 0,
                    width: `${A4_WIDTH_PX}px`,
                    visibility: 'hidden',
                    pointerEvents: 'none',
                }}
            >
                <ResumePreview resume={resume} />
            </div>

            {/* 导出专用分页内容：与预览分页同源，但不带阴影和页间距 */}
            <div
                id="resume-paper-export"
                style={{
                    position: 'absolute',
                    left: '-100000px',
                    top: 0,
                    width: `${A4_WIDTH_PX}px`,
                    visibility: 'hidden',
                    pointerEvents: 'none',
                    background: '#ffffff',
                }}
            >
                {Array.from({ length: pageCount }, (_, pageIndex) => {
                    const startOffset = pageStarts[pageIndex] ?? 0
                    const endOffset = pageStarts[pageIndex + 1] ?? contentHeight
                    const pageTopSafe = pageIndex === 0 ? 0 : PAGE_TOP_SAFE_PX
                    const maxSliceHeight = A4_HEIGHT_PX - pageTopSafe - PAGE_BOTTOM_SAFE_PX
                    const sliceHeight = Math.min(Math.max(1, endOffset - startOffset), maxSliceHeight)

                    return (
                        <div
                            key={`export-${pageIndex}`}
                            data-export-page
                            style={{
                                width: `${A4_WIDTH_PX}px`,
                                height: `${A4_HEIGHT_PX}px`,
                                overflow: 'hidden',
                                background: '#ffffff',
                            }}
                        >
                            <div
                                style={{
                                    width: `${A4_WIDTH_PX}px`,
                                    height: `${A4_HEIGHT_PX}px`,
                                    paddingTop: `${pageTopSafe}px`,
                                    paddingBottom: `${PAGE_BOTTOM_SAFE_PX}px`,
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${A4_WIDTH_PX}px`,
                                        height: `${sliceHeight}px`,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: `${A4_WIDTH_PX}px`,
                                            transform: `translateY(-${startOffset}px)`,
                                        }}
                                    >
                                        <ResumePreview resume={resume} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* 可见分页内容 */}
            <div
                style={{
                    width: `${A4_WIDTH_PX}px`,
                    height: `${totalVisibleHeight}px`,
                    position: 'relative',
                }}
            >
                {Array.from({ length: pageCount }, (_, pageIndex) => {
                    const top = pageIndex * (A4_HEIGHT_PX + PAGE_GAP_PX)
                    const startOffset = pageStarts[pageIndex] ?? 0
                    const endOffset = pageStarts[pageIndex + 1] ?? contentHeight
                    const pageTopSafe = pageIndex === 0 ? 0 : PAGE_TOP_SAFE_PX
                    const maxSliceHeight = A4_HEIGHT_PX - pageTopSafe - PAGE_BOTTOM_SAFE_PX
                    const sliceHeight = Math.min(Math.max(1, endOffset - startOffset), maxSliceHeight)
                    return (
                        <div
                            key={pageIndex}
                            className={`bg-white overflow-hidden ${pageShadowClassName}`}
                            style={{
                                width: `${A4_WIDTH_PX}px`,
                                height: `${A4_HEIGHT_PX}px`,
                                position: 'absolute',
                                left: 0,
                                top,
                            }}
                        >
                            <div
                                style={{
                                    width: `${A4_WIDTH_PX}px`,
                                    height: `${A4_HEIGHT_PX}px`,
                                    paddingTop: `${pageTopSafe}px`,
                                    paddingBottom: `${PAGE_BOTTOM_SAFE_PX}px`,
                                    boxSizing: 'border-box',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${A4_WIDTH_PX}px`,
                                        height: `${sliceHeight}px`,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: `${A4_WIDTH_PX}px`,
                                            transform: `translateY(-${startOffset}px)`,
                                        }}
                                    >
                                        <ResumePreview resume={resume} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}

export default PagedResumePaper
