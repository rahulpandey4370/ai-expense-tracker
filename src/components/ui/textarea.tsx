'use client';

import * as React from 'react';

import {cn} from '@/lib/utils';
import {FieldMic, splitLayoutClasses} from './field-mic';

type TextareaProps = React.ComponentProps<'textarea'> & {
  /** Show the dictation mic (default on). */
  voice?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({className, voice = true, ...props}, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);
    const withMic = voice;
    const [wrapperClass, fieldClass] = withMic ? splitLayoutClasses(className) : ['', className];

    const textarea = (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          // Short boxes grow with their text where supported (Chromium); tall paste boxes keep their rows.
          (!props.rows || props.rows <= 3) && '[field-sizing:content] max-h-60',
          fieldClass,
          withMic && '[grid-area:1/1]',
          withMic && !props.disabled && 'pr-9'
        )}
        ref={innerRef}
        {...props}
      />
    );
    if (!withMic) return textarea;
    return (
      <div className={cn('grid w-full', wrapperClass)}>
        {textarea}
        {!props.disabled && !props.readOnly && <FieldMic target={innerRef} multiline />}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};
