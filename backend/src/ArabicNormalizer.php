<?php

namespace App;

class ArabicNormalizer {
    /**
     * Normalizes Arabic text for database search matching.
     * Removes diacritics, normalizes various Alef, Teh Marbuta, and Yeh characters.
     */
    public static function normalize(?string $text): string {
        if ($text === null) {
            return '';
        }

        // Remove diacritics / harakat
        $diacritics = [
            chr(199).chr(145), // harakat
            '\x{064B}', '\x{064C}', '\x{064D}', // Tanween
            '\x{064E}', '\x{064F}', '\x{0650}', // Fatha, Damma, Kasra
            '\x{0651}', // Shadda
            '\x{0652}', // Sukun
            '\x{0640}', // Tatweel / Kashida
        ];
        
        $text = preg_replace('/[' . implode('', $diacritics) . ']/u', '', $text);

        // Replace Alef forms (أ, إ, آ) with bare Alef (ا)
        $text = preg_replace('/[أإآ]/u', 'ا', $text);

        // Replace Teh Marbuta (ة) with Heh (ه)
        $text = preg_replace('/ة/u', 'ه', $text);

        // Replace Alef Maksura (ى) with Yeh (ي)
        $text = preg_replace('/ى/u', 'ي', $text);

        // Normalize spaces
        $text = preg_replace('/\s+/u', ' ', $text);

        return trim($text);
    }
}
