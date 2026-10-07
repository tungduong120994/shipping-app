(function (root) {
    const helpers = {
        escapeHTML(value) {
            return String(value ?? '').replace(/[&<>"']/g, char => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[char]);
        },
        csvCell(value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; },
        normalizeInputCode(value) {
            let code = String(value).trim();
            const match = code.match(/\(([^)]+)\)/);
            if (match) code = match[1].trim();
            return code.split('-')[0].trim();
        },
        normalizeVND(value) {
            const number = parseFloat(value);
            if (!Number.isFinite(number) || number === 0) return 0;
            // Keep legacy shorthand: prices under 1000 are in thousands of VND.
            return number > 0 && number < 1000 ? number * 1000 : number;
        },
        roundUpToOneDecimal(value) {
            const scaled = Number(value) * 10;
            const nearest = Math.round(scaled);
            // Floating point noise must not add an extra 0.1 kg.
            return (Math.abs(scaled - nearest) < 1e-10 ? nearest : Math.ceil(scaled)) / 10;
        }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    else root.AppUtils = helpers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
