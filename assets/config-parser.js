/**
 * 配置文本识别器（三工具共用）。
 * 目标：尽量识别尺寸 / 格式 / 大小限制；把无法被固定字段覆盖、会影响设计验收的信息保留为「需求详述」。
 */
(function (global) {
    'use strict';

    const DIM_RE = /(\d{2,5})\s*(?:px)?\s*[xX×＊*]\s*(\d{2,5})\s*(?:px)?/;
    const SIZE_RE = /(\d+(?:\.\d+)?)\s*(kb|k|mb|m)\b/i;
    const FORMAT_RE = /\b(jpe?g|png|mp4|mov)\b/i;

    function compactText(s) {
        return String(s || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function cleanName(s) {
        return String(s || '')
            .replace(DIM_RE, ' ')
            .replace(SIZE_RE, ' ')
            .replace(FORMAT_RE, ' ')
            .replace(/(?:宽|高|尺寸|规格|格式|后缀|限制|大小|不超过|小于|≤|<=|像素|px|kb|mb|k|m)/ig, ' ')
            .replace(/[【】\[\]（）(){}，,;；:：|｜/\\]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function extractByLabels(text, labels) {
        const labelPart = labels.map((x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const re = new RegExp(`(?:【\\s*(?:${labelPart})\\s*】|(?:${labelPart})\\s*[:：])\\s*([^\\n【]+)`, 'i');
        const m = String(text || '').match(re);
        return m ? m[1].trim() : '';
    }

    function detectFormat(text, kind) {
        const m = String(text || '').match(FORMAT_RE);
        const raw = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : '';
        if (kind === 'video') return raw === 'mov' ? 'mov' : 'mp4';
        return raw === 'png' ? 'png' : 'jpg';
    }

    function detectDimension(text) {
        const s = String(text || '');
        let m = s.match(DIM_RE);
        if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
        const width = (s.match(/(?:宽|w|width)\s*[:：]?\s*(\d{2,5})/i) || [])[1];
        const height = (s.match(/(?:高|h|height)\s*[:：]?\s*(\d{2,5})/i) || [])[1];
        if (width && height) return { width: parseInt(width, 10), height: parseInt(height, 10) };
        return null;
    }

    function normalizeLimit(raw, kind, fallback) {
        const fb = fallback || (kind === 'video' ? 20 : 1000);
        const text = String(raw || '').trim();
        if (!text) return fb;
        const m = text.match(SIZE_RE);
        const num = Math.max(0, Number(m ? m[1] : text.replace(/[^\d.]/g, '')) || 0);
        if (!num) return fb;
        const unit = m ? m[2].toLowerCase() : (kind === 'video' ? 'mb' : 'kb');
        if (kind === 'video') {
            return unit.startsWith('k') ? Math.max(1, Math.ceil(num / 1024)) : Math.max(1, Math.ceil(num));
        }
        return unit.startsWith('m') ? Math.max(1, Math.round(num * 1024)) : Math.max(1, Math.round(num));
    }

    function buildDetail(rawText, fixedParts, explicitDetail) {
        if (explicitDetail) return compactText(explicitDetail);
        let s = String(rawText || '');
        fixedParts.filter(Boolean).sort((a, b) => String(b).length - String(a).length).forEach((part) => {
            const escaped = String(part).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            s = s.replace(new RegExp(escaped, 'g'), ' ');
        });
        s = s
            .replace(DIM_RE, ' ')
            .replace(SIZE_RE, ' ')
            .replace(FORMAT_RE, ' ')
            .replace(/\b[xX×＊*]\b/g, ' ')
            .replace(/(?:宽|高|尺寸|格式|后缀|限制|大小|不超过|小于|≤|<=|像素|px|kb|mb)\s*[:：]?/ig, ' ')
            .replace(/[【】\[\]{}|｜]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!s || fixedParts.some((p) => p && s === p)) return '';
        return s;
    }

    function rowFromParts(parts, kind, index) {
        const joined = parts.join(' ');
        let dim = detectDimension(joined);
        if (!dim && parts.length >= 5) {
            const nums = parts.map((p) => String(p || '').match(/^\s*(\d{2,5})\s*(?:px)?\s*$/i));
            const widthIdx = nums.findIndex((m, i) => i >= 2 && m);
            const heightIdx = nums.findIndex((m, i) => i > widthIdx && m);
            if (widthIdx >= 0 && heightIdx > widthIdx) {
                dim = { width: parseInt(nums[widthIdx][1], 10), height: parseInt(nums[heightIdx][1], 10) };
            }
        }
        if (!dim) return null;
        const fmt = detectFormat(joined, kind);
        const limitMatch = joined.match(SIZE_RE);
        let limitRaw = limitMatch ? limitMatch[0] : '';
        if (!limitRaw && parts.length >= 6) {
            const numericParts = parts.map((p) => String(p || '').trim()).filter((p) => /^\d+(?:\.\d+)?$/.test(p));
            if (numericParts.length >= 3) limitRaw = numericParts[numericParts.length - 1];
        }
        const limit = normalizeLimit(limitRaw, kind);
        const dimMatch = joined.match(DIM_RE);
        const beforeDim = dimMatch && typeof dimMatch.index === 'number' ? joined.slice(0, dimMatch.index) : '';
        let name = cleanName(parts.length > 1 ? (parts[1] || parts[0]) : (beforeDim || parts[0] || joined));
        if (!name || name.length > 24) name = `${index + 1}_${dim.width}x${dim.height}`;
        const detail = buildDetail(joined, [parts.length > 1 ? parts[0] : '', name, fmt, limitRaw, String(dim.width), String(dim.height)], '');
        return {
            id: String(index + 1),
            name,
            format: fmt,
            width: dim.width,
            height: dim.height,
            maxSize: limit,
            requirementDetail: detail
        };
    }

    function parseStandardBlocks(text, kind) {
        const blocks = String(text || '').match(/【\s*序号\s*】[\s\S]*?(?=(?:\n\s*)?【\s*序号\s*】|$)/g) || [];
        return blocks.map((block, index) => {
            const width = extractByLabels(block, ['宽', '宽度']);
            const height = extractByLabels(block, ['高', '高度']);
            const dim = detectDimension(`${width}x${height}`) || detectDimension(block);
            if (!dim) return null;
            const rawLimit = extractByLabels(block, kind === 'video' ? ['限制MB', '限制KB', '大小限制'] : ['限制KB', '限制MB', '大小限制']);
            return {
                id: extractByLabels(block, ['序号']) || String(index + 1),
                name: extractByLabels(block, ['描述名称', '名称', '规格名称']) || `${index + 1}_${dim.width}x${dim.height}`,
                format: detectFormat(extractByLabels(block, ['格式(jpg/png)', '格式(mov/mp4)', '格式', '后缀']) || block, kind),
                width: dim.width,
                height: dim.height,
                maxSize: normalizeLimit(rawLimit, kind),
                requirementDetail: buildDetail(block, [], extractByLabels(block, ['需求详述', '需求说明', '备注', '其他要求']))
            };
        }).filter(Boolean);
    }

    function splitTableLine(line) {
        if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
        if (line.includes(',')) return line.split(',').map((x) => x.trim());
        if (line.includes('，')) return line.split('，').map((x) => x.trim());
        return line.trim().split(/\s{2,}|\s+\|\s+|\s*;\s*/).map((x) => x.trim()).filter(Boolean);
    }

    function parseLooseLines(text, kind) {
        return String(text || '')
            .split(/\n+/)
            .map((line) => line.trim())
            .map((line, index) => rowFromParts(splitTableLine(line), kind, index))
            .filter(Boolean);
    }

    function normalizeRows(rows, kind) {
        const seen = new Map();
        return rows.map((row, index) => {
            const width = Math.max(1, parseInt(row.width, 10) || 1);
            const height = Math.max(1, parseInt(row.height, 10) || 1);
            let name = String(row.name || '').trim() || `${index + 1}_${width}x${height}`;
            if (name.length > 32) name = name.slice(0, 32);
            const n = seen.get(name) || 0;
            seen.set(name, n + 1);
            if (n > 0) name = `${name}(${n})`;
            return {
                id: String(row.id || index + 1).trim() || String(index + 1),
                name,
                format: detectFormat(row.format || '', kind),
                width,
                height,
                maxSize: normalizeLimit(row.maxSize, kind),
                requirementDetail: compactText(row.requirementDetail || '')
            };
        });
    }

    function parseText(text, options) {
        const kind = options && options.kind === 'video' ? 'video' : 'image';
        const standard = parseStandardBlocks(text, kind);
        if (standard.length) return normalizeRows(standard, kind);
        return normalizeRows(parseLooseLines(text, kind), kind);
    }

    global.ConfigTextParser = {
        parseText,
        normalizeRows,
        normalizeLimit
    };
})(typeof window !== 'undefined' ? window : global);
