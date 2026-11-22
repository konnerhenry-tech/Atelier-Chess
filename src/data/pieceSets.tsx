import React from 'react';
import { PieceCode } from '../types/chess';

export type PieceGeometryFamily =
  | 'staunton'
  | 'neo'
  | 'bauhaus'
  | 'pixel'
  | 'nordic'
  | 'wireframe'
  | 'letterpress';

export interface PieceSetDefinition {
  id: string;
  name: string;
  family: PieceGeometryFamily;
  category: 'Classic' | 'Modern' | 'Luxury' | 'Artistic' | 'High Contrast';
  description: string;
  whiteFill: string;
  whiteFillSecondary: string;
  whiteStroke: string;
  whiteDetail: string;
  blackFill: string;
  blackFillSecondary: string;
  blackStroke: string;
  blackDetail: string;
  strokeWidth?: number;
  glowColor?: string;
}

export const PIECE_SETS: PieceSetDefinition[] = [
  {
    id: 'classic-staunton',
    name: 'Classic Staunton',
    family: 'staunton',
    category: 'Classic',
    description: 'Traditional tournament boxwood and ebony Staunton silhouettes.',
    whiteFill: '#F9F5EB',
    whiteFillSecondary: '#E5DCCB',
    whiteStroke: '#231F1D',
    whiteDetail: '#231F1D',
    blackFill: '#2C2826',
    blackFillSecondary: '#161413',
    blackStroke: '#0D0B0A',
    blackDetail: '#E7DFD2',
    strokeWidth: 1.5,
  },
  {
    id: 'merida-heritage',
    name: 'Merida Heritage',
    family: 'staunton',
    category: 'Classic',
    description: 'Balanced weighted club proportions with warm ivory sheen.',
    whiteFill: '#FFFDF7',
    whiteFillSecondary: '#EADFD0',
    whiteStroke: '#1D1B1A',
    whiteDetail: '#1D1B1A',
    blackFill: '#3B3734',
    blackFillSecondary: '#201D1B',
    blackStroke: '#12100E',
    blackDetail: '#F5ECE0',
    strokeWidth: 1.65,
  },
  {
    id: 'cburnett-tournament',
    name: 'Cburnett Clean',
    family: 'neo',
    category: 'Classic',
    description: 'Crisp high-legibility broadcast standard with clean contours.',
    whiteFill: '#FFFFFF',
    whiteFillSecondary: '#E6E8EC',
    whiteStroke: '#1E242B',
    whiteDetail: '#1E242B',
    blackFill: '#2E3440',
    blackFillSecondary: '#1A1E26',
    blackStroke: '#111419',
    blackDetail: '#ECEFF4',
    strokeWidth: 1.55,
  },
  {
    id: 'alpha-club',
    name: 'Alpha Crisp',
    family: 'neo',
    category: 'Modern',
    description: 'Flat vector club forms engineered for rapid bullet recognition.',
    whiteFill: '#F4F4F0',
    whiteFillSecondary: '#DCDCD4',
    whiteStroke: '#18181B',
    whiteDetail: '#18181B',
    blackFill: '#1E2024',
    blackFillSecondary: '#111215',
    blackStroke: '#09090B',
    blackDetail: '#E4E4E7',
    strokeWidth: 1.4,
  },
  {
    id: 'neo-studio',
    name: 'Neo Atelier',
    family: 'neo',
    category: 'Modern',
    description: 'Soft warm bone paired with deep charcoal graphite.',
    whiteFill: '#F5EFE6',
    whiteFillSecondary: '#DFD3C3',
    whiteStroke: '#2D2A26',
    whiteDetail: '#2D2A26',
    blackFill: '#343A40',
    blackFillSecondary: '#1D2125',
    blackStroke: '#121518',
    blackDetail: '#EFE6D8',
    strokeWidth: 1.5,
  },
  {
    id: 'brass-obsidian',
    name: 'Brass & Obsidian',
    family: 'staunton',
    category: 'Luxury',
    description: 'Brushed warm gold pieces facing matte obsidian silhouettes.',
    whiteFill: '#F2D27A',
    whiteFillSecondary: '#C89B3C',
    whiteStroke: '#4A3309',
    whiteDetail: '#4A3309',
    blackFill: '#1B1D24',
    blackFillSecondary: '#0C0E12',
    blackStroke: '#C89B3C',
    blackDetail: '#F2D27A',
    strokeWidth: 1.5,
  },
  {
    id: 'marble-sculpted',
    name: 'Carrara & Slate',
    family: 'staunton',
    category: 'Luxury',
    description: 'Chiseled alabaster marble contrasted with deep volcanic basalt.',
    whiteFill: '#F6F7F8',
    whiteFillSecondary: '#D8DDE3',
    whiteStroke: '#38414C',
    whiteDetail: '#38414C',
    blackFill: '#2C333D',
    blackFillSecondary: '#181C22',
    blackStroke: '#0E1115',
    blackDetail: '#CFD7E0',
    strokeWidth: 1.5,
  },
  {
    id: 'rosewood-boxwood',
    name: 'Rosewood & Boxwood',
    family: 'staunton',
    category: 'Luxury',
    description: 'Hand-turned crimson rosewood against golden boxwood.',
    whiteFill: '#F7DFAC',
    whiteFillSecondary: '#DDB76E',
    whiteStroke: '#4A2B13',
    whiteDetail: '#4A2B13',
    blackFill: '#6B241C',
    blackFillSecondary: '#42130E',
    blackStroke: '#240805',
    blackDetail: '#F7DFAC',
    strokeWidth: 1.55,
  },
  {
    id: 'jade-ivory',
    name: 'Imperial Jade',
    family: 'staunton',
    category: 'Luxury',
    description: 'Translucent pale ivory opposing deep imperial nephrite jade.',
    whiteFill: '#FAF6EB',
    whiteFillSecondary: '#E3DAC4',
    whiteStroke: '#26382E',
    whiteDetail: '#26382E',
    blackFill: '#1C5440',
    blackFillSecondary: '#0E3326',
    blackStroke: '#071F17',
    blackDetail: '#D7EDE2',
    strokeWidth: 1.55,
  },
  {
    id: 'cobalt-silver',
    name: 'Cobalt & Silver',
    family: 'neo',
    category: 'Luxury',
    description: 'Brushed sterling silver vs deep royal sapphire enamel.',
    whiteFill: '#EFF3F8',
    whiteFillSecondary: '#C8D3E0',
    whiteStroke: '#1D3354',
    whiteDetail: '#1D3354',
    blackFill: '#1E3A6E',
    blackFillSecondary: '#112244',
    blackStroke: '#09142B',
    blackDetail: '#DCE6F5',
    strokeWidth: 1.55,
  },
  {
    id: 'ruby-pearl',
    name: 'Ruby & Pearl',
    family: 'staunton',
    category: 'Luxury',
    description: 'Lustrous pearl white against dark garnet crimson.',
    whiteFill: '#FFF9FA',
    whiteFillSecondary: '#EADCE0',
    whiteStroke: '#3D1520',
    whiteDetail: '#3D1520',
    blackFill: '#6E182B',
    blackFillSecondary: '#450C18',
    blackStroke: '#24050C',
    blackDetail: '#FDE8ED',
    strokeWidth: 1.55,
  },
  {
    id: 'nordic-minimal',
    name: 'Nordic Minimal',
    family: 'nordic',
    category: 'Modern',
    description: 'Architectural Scandinavian monoliths with clean geometric poise.',
    whiteFill: '#F4F4F1',
    whiteFillSecondary: '#DFDFD8',
    whiteStroke: '#26282B',
    whiteDetail: '#26282B',
    blackFill: '#24272B',
    blackFillSecondary: '#15171A',
    blackStroke: '#0A0B0D',
    blackDetail: '#E5E7EB',
    strokeWidth: 1.45,
  },
  {
    id: 'nordic-timber',
    name: 'Nordic Timber',
    family: 'nordic',
    category: 'Modern',
    description: 'Birchwood minimalist forms facing charred Shou Sugi Ban oak.',
    whiteFill: '#F5E7CE',
    whiteFillSecondary: '#D8C19A',
    whiteStroke: '#3B2D1F',
    whiteDetail: '#3B2D1F',
    blackFill: '#332820',
    blackFillSecondary: '#1E1712',
    blackStroke: '#120D0A',
    blackDetail: '#EAD7BA',
    strokeWidth: 1.5,
  },
  {
    id: 'bauhaus-1923',
    name: 'Bauhaus 1923',
    family: 'bauhaus',
    category: 'Artistic',
    description: 'Geometric abstraction inspired by Josef Hartwig’s Weimar set.',
    whiteFill: '#F2EFE9',
    whiteFillSecondary: '#D8D2C5',
    whiteStroke: '#1F1F1F',
    whiteDetail: '#C93B2B',
    blackFill: '#222428',
    blackFillSecondary: '#131417',
    blackStroke: '#090A0B',
    blackDetail: '#E5A93C',
    strokeWidth: 1.6,
  },
  {
    id: 'bauhaus-primary',
    name: 'Weimar Primary',
    family: 'bauhaus',
    category: 'Artistic',
    description: 'Playful modernist geometry with warm ochre and cobalt accents.',
    whiteFill: '#F7F3E8',
    whiteFillSecondary: '#E5DEC9',
    whiteStroke: '#1A2433',
    whiteDetail: '#1D4ED8',
    blackFill: '#1B2838',
    blackFillSecondary: '#0F1824',
    blackStroke: '#070C12',
    blackDetail: '#F59E0B',
    strokeWidth: 1.6,
  },
  {
    id: 'pixel-arcade',
    name: 'Pixel 8-Bit',
    family: 'pixel',
    category: 'Artistic',
    description: 'Crisp stepped pixel-art pieces crafted for retro arcade play.',
    whiteFill: '#F8FAFC',
    whiteFillSecondary: '#CBD5E1',
    whiteStroke: '#0F172A',
    whiteDetail: '#0F172A',
    blackFill: '#334155',
    blackFillSecondary: '#1E293B',
    blackStroke: '#020617',
    blackDetail: '#E2E8F0',
    strokeWidth: 1.2,
  },
  {
    id: 'pixel-emerald',
    name: 'Pixel Cartridge',
    family: 'pixel',
    category: 'Artistic',
    description: 'Handheld emerald cartridge palette with crisp stepped edges.',
    whiteFill: '#ECFDF5',
    whiteFillSecondary: '#A7F3D0',
    whiteStroke: '#064E3B',
    whiteDetail: '#064E3B',
    blackFill: '#065F46',
    blackFillSecondary: '#022C22',
    blackStroke: '#011B15',
    blackDetail: '#6EE7B7',
    strokeWidth: 1.2,
  },
  {
    id: 'glass-frosted',
    name: 'Frosted Glass',
    family: 'wireframe',
    category: 'Artistic',
    description: 'Translucent crystalline outlines with soft inner luminance.',
    whiteFill: 'rgba(255, 255, 255, 0.72)',
    whiteFillSecondary: 'rgba(226, 232, 240, 0.5)',
    whiteStroke: '#1E293B',
    whiteDetail: '#0F172A',
    blackFill: 'rgba(15, 23, 42, 0.72)',
    blackFillSecondary: 'rgba(30, 41, 59, 0.55)',
    blackStroke: '#E2E8F0',
    blackDetail: '#F8FAFC',
    strokeWidth: 2,
  },
  {
    id: 'neon-cyber',
    name: 'Neon Wireframe',
    family: 'wireframe',
    category: 'Artistic',
    description: 'Luminous cyan and amber vector outlines for dark boards.',
    whiteFill: 'rgba(34, 211, 238, 0.18)',
    whiteFillSecondary: 'rgba(34, 211, 238, 0.08)',
    whiteStroke: '#22D3EE',
    whiteDetail: '#A5F3FC',
    blackFill: 'rgba(245, 158, 11, 0.18)',
    blackFillSecondary: 'rgba(245, 158, 11, 0.08)',
    blackStroke: '#F59E0B',
    blackDetail: '#FDE68A',
    strokeWidth: 2.1,
    glowColor: 'rgba(34,211,238,0.35)',
  },
  {
    id: 'sketch-ink',
    name: 'Editorial Ink',
    family: 'wireframe',
    category: 'Artistic',
    description: 'Fine architectural pen-and-ink linework on parchment tones.',
    whiteFill: '#FCFBF7',
    whiteFillSecondary: '#F0ECE1',
    whiteStroke: '#1C1917',
    whiteDetail: '#1C1917',
    blackFill: '#292524',
    blackFillSecondary: '#1C1917',
    blackStroke: '#0C0A09',
    blackDetail: '#F5F5F4',
    strokeWidth: 1.85,
  },
  {
    id: 'letterpress-crest',
    name: 'Letterpress Crest',
    family: 'letterpress',
    category: 'High Contrast',
    description: 'Architectural monogram shields for instant piece identification.',
    whiteFill: '#FFFFFF',
    whiteFillSecondary: '#E7E5E4',
    whiteStroke: '#1C1917',
    whiteDetail: '#1C1917',
    blackFill: '#1C1917',
    blackFillSecondary: '#0C0A09',
    blackStroke: '#F5F5F4',
    blackDetail: '#FAFAF9',
    strokeWidth: 1.8,
  },
  {
    id: 'high-contrast-pro',
    name: 'WCAG High Contrast',
    family: 'neo',
    category: 'High Contrast',
    description: 'Maximum edge contrast for tournament accessibility and clarity.',
    whiteFill: '#FFFFFF',
    whiteFillSecondary: '#F1F5F9',
    whiteStroke: '#000000',
    whiteDetail: '#000000',
    blackFill: '#000000',
    blackFillSecondary: '#0F172A',
    blackStroke: '#FFFFFF',
    blackDetail: '#FFFFFF',
    strokeWidth: 2.2,
  },
  {
    id: 'brutalist-steel',
    name: 'Brutalist Steel',
    family: 'nordic',
    category: 'Modern',
    description: 'Architectural brushed titanium opposing matte gunmetal forged steel.',
    whiteFill: '#E2E8F0',
    whiteFillSecondary: '#94A3B8',
    whiteStroke: '#1E293B',
    whiteDetail: '#0F172A',
    blackFill: '#334155',
    blackFillSecondary: '#0F172A',
    blackStroke: '#020617',
    blackDetail: '#38BDF8',
    strokeWidth: 1.65,
  },
  {
    id: 'imperial-ivory-crimson',
    name: 'Imperial Ivory & Crimson',
    family: 'staunton',
    category: 'Luxury',
    description: 'Warm museum ivory contrasted against regal lacquer vermilion.',
    whiteFill: '#FFFBEB',
    whiteFillSecondary: '#FDE68A',
    whiteStroke: '#451A03',
    whiteDetail: '#78350F',
    blackFill: '#991B1B',
    blackFillSecondary: '#450A0A',
    blackStroke: '#2E0505',
    blackDetail: '#FEF3C7',
    strokeWidth: 1.6,
  },
];

export function getPieceSetById(id: string): PieceSetDefinition {
  return PIECE_SETS.find((s) => s.id === id) || PIECE_SETS[0];
}

interface PieceSvgProps {
  piece: PieceCode;
  setId: string;
  className?: string;
}

/**
 * Renders any of the 12 chess pieces across all 22 custom SVG piece sets.
 * Uses pure vector SVG geometry (never Unicode chess glyphs).
 */
export const ChessPieceSvg: React.FC<PieceSvgProps> = React.memo(({ piece, setId, className = 'w-full h-full' }) => {
  const set = getPieceSetById(setId);
  const isWhite = piece[0] === 'w';
  const type = piece[1] as 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

  const fill = isWhite ? set.whiteFill : set.blackFill;
  const fill2 = isWhite ? set.whiteFillSecondary : set.blackFillSecondary;
  const stroke = isWhite ? set.whiteStroke : set.blackStroke;
  const detail = isWhite ? set.whiteDetail : set.blackDetail;
  const sw = set.strokeWidth ?? 1.5;

  const gradId = `grad-${set.id}-${piece}`;

  const renderStauntonOrNeo = (isNeo: boolean) => {
    const r = isNeo ? 0.5 : 0;
    switch (type) {
      case 'P':
        return (
          <g>
            <circle cx="22.5" cy="12.5" r={isNeo ? '4.8' : '4.5'} fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <path
              d={
                isNeo
                  ? 'M18.5 17.2 C16.5 21 15.5 25 14.5 29.5 L30.5 29.5 C29.5 25 28.5 21 26.5 17.2 Z'
                  : 'M18 17 C16 20 17 22 15 26 C13.5 28.5 13 30.5 13 32.5 L32 32.5 C32 30.5 31.5 28.5 30 26 C28 22 29 20 27 17 Z'
              }
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <rect x="10.5" y="32.5" width="24" height="4.5" rx={2 + r} fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <rect x="9" y="37" width="27" height="3.2" rx="1.5" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'R':
        return (
          <g>
            <path
              d="M12.5 9 L16.5 9 L16.5 13 L20.5 13 L20.5 9 L24.5 9 L24.5 13 L28.5 13 L28.5 9 L32.5 9 L32.5 17 L12.5 17 Z"
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <path
              d="M14.5 17 L13.5 32.5 L31.5 32.5 L30.5 17 Z"
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <path d="M16 21.5 L29 21.5 M15.5 27.5 L29.5 27.5" stroke={detail} strokeWidth={1.1} opacity="0.45" strokeLinecap="round" />
            <rect x="10" y="32.5" width="25" height="4" rx="1.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <rect x="8.5" y="36.5" width="28" height="3.5" rx="1.5" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'N':
        return (
          <g>
            <path
              d="M14 33 L14.5 28.5 C15 24 18 22.5 20.5 20.5 C18.5 20 15.5 21 13.5 22 C11.5 23 9.5 21.5 10.5 19 C11.8 15.8 15.5 12 18.5 10.2 L19.5 7 L23 9.5 C27.5 10 31.5 13.5 33 18.5 C34.2 22.5 33.5 28 31.5 33 Z"
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <circle cx="17.5" cy="14.5" r="1.3" fill={detail} />
            <path d="M24 13.5 C27.5 15.5 29.5 20 29 26.5" fill="none" stroke={detail} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
            <path d="M12.5 20.2 L13.5 19.2" stroke={detail} strokeWidth="1.4" strokeLinecap="round" />
            <rect x="10" y="33" width="25" height="3.8" rx="1.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <rect x="8.5" y="36.8" width="28" height="3.2" rx="1.5" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'B':
        return (
          <g>
            <circle cx="22.5" cy="7.5" r="2.3" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <path
              d="M22.5 10 C17 13 14.5 18.5 16 24.5 C16.7 27 18.2 29 19 30.5 L26 30.5 C26.8 29 28.3 27 29 24.5 C30.5 18.5 28 13 22.5 10 Z"
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <path d="M19.5 16.5 L25.5 22.5 M25.5 16.5 L19.5 22.5" stroke={detail} strokeWidth="1.35" strokeLinecap="round" opacity="0.8" />
            <path d="M15.5 30.5 L29.5 30.5 L31 33.5 L14 33.5 Z" fill={fill2} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <rect x="9.5" y="33.5" width="26" height="3.4" rx="1.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <rect x="8.5" y="36.9" width="28" height="3.1" rx="1.5" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'Q':
        return (
          <g>
            <circle cx="9.5" cy="12" r="2" fill={fill} stroke={stroke} strokeWidth={sw} />
            <circle cx="15.5" cy="9" r="2" fill={fill} stroke={stroke} strokeWidth={sw} />
            <circle cx="22.5" cy="7.5" r="2.2" fill={fill} stroke={stroke} strokeWidth={sw} />
            <circle cx="29.5" cy="9" r="2" fill={fill} stroke={stroke} strokeWidth={sw} />
            <circle cx="35.5" cy="12" r="2" fill={fill} stroke={stroke} strokeWidth={sw} />
            <path
              d="M10.5 14 L15.2 25 L16 11 L20.5 23.5 L22.5 10 L24.5 23.5 L29 11 L29.8 25 L34.5 14 L31 31.5 L14 31.5 Z"
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <path d="M14.5 28.5 C19.5 27 25.5 27 30.5 28.5" fill="none" stroke={detail} strokeWidth="1.2" opacity="0.7" />
            <rect x="11" y="31.5" width="23" height="3.4" rx="1.5" fill={fill2} stroke={stroke} strokeWidth={sw} />
            <rect x="9" y="34.9" width="27" height="3.6" rx="1.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'K':
        return (
          <g>
            <path d="M22.5 5.5 L22.5 12 M19.2 8.2 L25.8 8.2" stroke={stroke} strokeWidth={sw + 0.7} strokeLinecap="round" />
            <path d="M22.5 5.5 L22.5 12 M19.2 8.2 L25.8 8.2" stroke={fill} strokeWidth={Math.max(1, sw - 0.3)} strokeLinecap="round" />
            <path
              d="M22.5 12.5 C19.5 12.5 17.5 14.5 18 17 C13 15 9.5 18.5 10.5 23.5 C11.3 27.2 14 29.8 14.5 31.5 L30.5 31.5 C31 29.8 33.7 27.2 34.5 23.5 C35.5 18.5 32 15 27 17 C27.5 14.5 25.5 12.5 22.5 12.5 Z"
              fill={`url(#${gradId})`}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            <path d="M22.5 16.5 L22.5 29 M14 26.5 C19 25 26 25 31 26.5" fill="none" stroke={detail} strokeWidth="1.2" opacity="0.6" strokeLinecap="round" />
            <rect x="11" y="31.5" width="23" height="3.5" rx="1.5" fill={fill2} stroke={stroke} strokeWidth={sw} />
            <rect x="9" y="35" width="27" height="3.8" rx="1.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
          </g>
        );
    }
  };

  const renderNordic = () => {
    switch (type) {
      case 'P':
        return (
          <g>
            <circle cx="22.5" cy="14" r="4.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <path d="M16.5 36 L19.5 20.5 L25.5 20.5 L28.5 36 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <rect x="12" y="36" width="21" height="3.5" rx="1" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'R':
        return (
          <g>
            <path d="M13.5 10 L17.5 10 L17.5 13.5 L20.5 13.5 L20.5 10 L24.5 10 L24.5 13.5 L27.5 13.5 L27.5 10 L31.5 10 L31.5 36 L13.5 36 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <rect x="10.5" y="36" width="24" height="3.5" rx="1" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'N':
        return (
          <g>
            <path d="M14.5 36 L15.5 22 L11 19.5 L17.5 10.5 L25 9.5 L31.5 16.5 L29.5 36 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <circle cx="19" cy="15.5" r="1.3" fill={detail} />
            <rect x="11" y="36" width="23" height="3.5" rx="1" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'B':
        return (
          <g>
            <polygon points="22.5,7.5 30,22 27.5,36 17.5,36 15,22" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <line x1="20" y1="16" x2="25" y2="21" stroke={detail} strokeWidth="1.5" strokeLinecap="round" />
            <rect x="11" y="36" width="23" height="3.5" rx="1" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'Q':
        return (
          <g>
            <polygon points="10.5,11 16.5,20 22.5,8.5 28.5,20 34.5,11 30.5,36 14.5,36" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <rect x="10.5" y="36" width="24" height="3.5" rx="1" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'K':
        return (
          <g>
            <path d="M22.5 5.5 L22.5 11.5 M19.5 8.5 L25.5 8.5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
            <polygon points="15,13 30,13 32,36 13,36" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
            <rect x="10" y="36" width="25" height="3.5" rx="1" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
    }
  };

  const renderBauhaus = () => {
    switch (type) {
      case 'P':
        return (
          <g>
            <rect x="14.5" y="19" width="16" height="16" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <circle cx="22.5" cy="14" r="3.5" fill={detail} stroke={stroke} strokeWidth={1.2} />
          </g>
        );
      case 'R':
        return (
          <g>
            <rect x="12" y="12" width="21" height="24" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <rect x="16.5" y="16.5" width="12" height="6" fill={detail} opacity="0.85" />
          </g>
        );
      case 'N':
        return (
          <g>
            <path d="M12 36 L12 18 L24 18 L24 10 L33 10 L33 26 L22 26 L22 36 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} strokeLinejoin="miter" />
            <circle cx="28.5" cy="14.5" r="2" fill={detail} />
          </g>
        );
      case 'B':
        return (
          <g>
            <rect x="13" y="13" width="19" height="19" transform="rotate(45 22.5 22.5)" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <line x1="15" y1="30" x2="30" y2="15" stroke={detail} strokeWidth="2" />
            <rect x="11" y="34.5" width="23" height="4" fill={fill2} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'Q':
        return (
          <g>
            <rect x="11.5" y="20" width="22" height="16.5" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <circle cx="22.5" cy="14" r="7.5" fill={detail} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      case 'K':
        return (
          <g>
            <rect x="11" y="19" width="23" height="18" fill={`url(#${gradId})`} stroke={stroke} strokeWidth={sw} />
            <rect x="19" y="8" width="7" height="15" fill={detail} stroke={stroke} strokeWidth={1.3} />
            <rect x="15" y="12" width="15" height="7" fill={detail} stroke={stroke} strokeWidth={1.3} />
          </g>
        );
    }
  };

  const renderPixel = () => {
    const px = (x: number, y: number, w: number, h: number, c = fill) => (
      <rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} fill={c} />
    );
    switch (type) {
      case 'P':
        return (
          <g stroke={stroke} strokeWidth="0.9">
            {px(18, 10, 9, 9)}
            {px(16, 19, 13, 4)}
            {px(18, 23, 9, 8)}
            {px(13, 31, 19, 4)}
            {px(10, 35, 25, 4, fill2)}
          </g>
        );
      case 'R':
        return (
          <g stroke={stroke} strokeWidth="0.9">
            {px(11, 8, 5, 6)}
            {px(20, 8, 5, 6)}
            {px(29, 8, 5, 6)}
            {px(11, 14, 23, 5)}
            {px(15, 19, 15, 12)}
            {px(11, 31, 23, 4)}
            {px(9, 35, 27, 4, fill2)}
          </g>
        );
      case 'N':
        return (
          <g stroke={stroke} strokeWidth="0.9">
            {px(19, 8, 9, 5)}
            {px(13, 13, 19, 5)}
            {px(10, 18, 9, 5)}
            {px(21, 18, 12, 13)}
            {px(15, 25, 7, 6)}
            {px(17, 15, 3, 3, detail)}
            {px(11, 31, 23, 4)}
            {px(9, 35, 27, 4, fill2)}
          </g>
        );
      case 'B':
        return (
          <g stroke={stroke} strokeWidth="0.9">
            {px(20, 6, 5, 4)}
            {px(16, 10, 13, 5)}
            {px(14, 15, 17, 10)}
            {px(17, 25, 11, 6)}
            {px(20, 16, 5, 5, detail)}
            {px(11, 31, 23, 4)}
            {px(9, 35, 27, 4, fill2)}
          </g>
        );
      case 'Q':
        return (
          <g stroke={stroke} strokeWidth="0.9">
            {px(9, 10, 4, 4)}
            {px(16, 8, 4, 4)}
            {px(23, 8, 4, 4)}
            {px(32, 10, 4, 4)}
            {px(11, 14, 23, 5)}
            {px(14, 19, 17, 12)}
            {px(11, 31, 23, 4)}
            {px(9, 35, 27, 4, fill2)}
          </g>
        );
      case 'K':
        return (
          <g stroke={stroke} strokeWidth="0.9">
            {px(20, 5, 5, 8, detail)}
            {px(17, 7, 11, 4, detail)}
            {px(12, 14, 21, 5)}
            {px(10, 19, 25, 6)}
            {px(14, 25, 17, 6)}
            {px(11, 31, 23, 4)}
            {px(9, 35, 27, 4, fill2)}
          </g>
        );
    }
  };

  const renderLetterpress = () => {
    const labelMap = { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: 'P' };
    return (
      <g>
        <path
          d="M9.5 11 C9.5 8.5 11.5 6.5 14 6.5 L31 6.5 C33.5 6.5 35.5 8.5 35.5 11 L35.5 26 C35.5 33 22.5 39 22.5 39 C22.5 39 9.5 33 9.5 26 Z"
          fill={`url(#${gradId})`}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <path
          d="M12.5 12 C12.5 10.5 13.7 9.5 15.2 9.5 L29.8 9.5 C31.3 9.5 32.5 10.5 32.5 12 L32.5 25 C32.5 30 22.5 35.2 22.5 35.2 C22.5 35.2 12.5 30 12.5 25 Z"
          fill="none"
          stroke={detail}
          strokeWidth="0.9"
          opacity="0.35"
        />
        <text
          x="22.5"
          y="27"
          textAnchor="middle"
          fill={detail}
          fontSize="16.5"
          fontWeight="700"
          fontFamily="Fraunces, Georgia, serif"
        >
          {labelMap[type]}
        </text>
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 45 45"
      className={className}
      style={set.glowColor ? { filter: `drop-shadow(0 0 4px ${set.glowColor})` } : undefined}
      aria-label={`${isWhite ? 'White' : 'Black'} ${type}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor={fill2} />
        </linearGradient>
      </defs>
      {set.family === 'staunton' && renderStauntonOrNeo(false)}
      {set.family === 'neo' && renderStauntonOrNeo(true)}
      {set.family === 'wireframe' && renderStauntonOrNeo(true)}
      {set.family === 'nordic' && renderNordic()}
      {set.family === 'bauhaus' && renderBauhaus()}
      {set.family === 'pixel' && renderPixel()}
      {set.family === 'letterpress' && renderLetterpress()}
    </svg>
  );
});

ChessPieceSvg.displayName = 'ChessPieceSvg';
