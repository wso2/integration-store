/*
 Copyright (c) 2026 WSO2 LLC. (http://www.wso2.com) All Rights Reserved.

 WSO2 LLC. licenses this file to you under the Apache License,
 Version 2.0 (the "License"); you may not use this file except
 in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

import React from 'react';
import { act, render, renderHook, screen, fireEvent } from '@testing-library/react';
import Pagination, { useCloseOnScroll } from './Pagination';

describe('Pagination', () => {
  const defaultProps = {
    currentPage: 1,
    totalItems: 100,
    pageSize: 30,
    onPageChange: jest.fn(),
    onPageSizeChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render pagination info correctly', () => {
    render(<Pagination {...defaultProps} />);

    expect(screen.getByText('Showing 1-30 of 100')).toBeInTheDocument();
  });

  it('should show correct range for middle pages', () => {
    render(<Pagination {...defaultProps} currentPage={2} />);

    expect(screen.getByText('Showing 31-60 of 100')).toBeInTheDocument();
  });

  it('should show correct range for last page', () => {
    render(<Pagination {...defaultProps} currentPage={4} />);

    expect(screen.getByText('Showing 91-100 of 100')).toBeInTheDocument();
  });

  it('should disable Previous button on first page', () => {
    render(<Pagination {...defaultProps} currentPage={1} />);

    const prevButton = screen.getByRole('button', { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it('should disable Next button on last page', () => {
    render(<Pagination {...defaultProps} currentPage={4} />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('should call onPageChange when clicking Next', () => {
    const onPageChange = jest.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('should call onPageChange when clicking Previous', () => {
    const onPageChange = jest.fn();
    render(<Pagination {...defaultProps} currentPage={2} onPageChange={onPageChange} />);

    const prevButton = screen.getByRole('button', { name: /previous/i });
    fireEvent.click(prevButton);

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('should call onPageChange when clicking a page number', () => {
    const onPageChange = jest.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);

    const page3Button = screen.getByRole('button', { name: '3' });
    fireEvent.click(page3Button);

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('should highlight current page button', () => {
    render(<Pagination {...defaultProps} currentPage={2} />);

    const page2Button = screen.getByRole('button', { name: '2' });
    // MUI contained variant has specific class
    expect(page2Button).toHaveClass('MuiButton-contained');
  });

  it('should show all pages when total pages is 5 or less', () => {
    render(<Pagination {...defaultProps} totalItems={150} pageSize={30} />);

    // Should show pages 1-5
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
  });

  it('should show ellipsis when there are many pages', () => {
    render(<Pagination {...defaultProps} totalItems={300} pageSize={30} />);

    // Should show ellipsis
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should call onPageSizeChange when selecting different page size', () => {
    const onPageSizeChange = jest.fn();
    render(<Pagination {...defaultProps} onPageSizeChange={onPageSizeChange} />);

    // Open the select dropdown
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    // Click on 50 Items option
    const option50 = screen.getByRole('option', { name: '50 Items' });
    fireEvent.click(option50);

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('should render custom page size options', () => {
    render(<Pagination {...defaultProps} pageSize={10} pageSizeOptions={[5, 10, 15]} />);

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    expect(screen.getByRole('option', { name: '5 Items' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '10 Items' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '15 Items' })).toBeInTheDocument();
  });

  it('should handle single page correctly', () => {
    render(<Pagination {...defaultProps} totalItems={10} pageSize={30} />);

    // Both buttons should be disabled for single page
    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  it('should handle zero items', () => {
    render(<Pagination {...defaultProps} totalItems={0} />);

    // Should show correct range even with zero items
    expect(screen.getByText(/Showing 0-0 of 0/)).toBeInTheDocument();
  });
});

describe('useCloseOnScroll', () => {
  it('keeps the page scrollable and leaves focus handling to the hook', () => {
    const { result } = renderHook(() => useCloseOnScroll());
    expect(result.current.MenuProps).toEqual({
      disableScrollLock: true,
      disableRestoreFocus: true,
    });
  });

  it('skips the exit transition only when closed by scrolling', () => {
    const { result } = renderHook(() => useCloseOnScroll());
    act(() => result.current.onOpen());
    act(() => result.current.onClose());
    expect(result.current.MenuProps).not.toHaveProperty('transitionDuration');

    act(() => result.current.onOpen());
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.MenuProps).toHaveProperty('transitionDuration', 0);

    act(() => result.current.onOpen());
    expect(result.current.MenuProps).not.toHaveProperty('transitionDuration');
  });

  it('returns focus to the button that opened the menu when it closes', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const { result } = renderHook(() => useCloseOnScroll());

    button.focus();
    act(() => result.current.onOpen());
    (document.activeElement as HTMLElement).blur();
    act(() => result.current.onClose());
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('closes when the window scrolls while open', () => {
    const { result } = renderHook(() => useCloseOnScroll());
    act(() => result.current.onOpen());
    expect(result.current.open).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.open).toBe(false);
  });

  it('ignores scrolling of an inner element (does not bubble to window)', () => {
    const { result } = renderHook(() => useCloseOnScroll());
    act(() => result.current.onOpen());

    const list = document.createElement('ul');
    document.body.appendChild(list);
    act(() => {
      list.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.open).toBe(true);
    list.remove();
  });

  it('listens only while open and removes the listener on unmount', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => useCloseOnScroll());
    expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(0);

    act(() => result.current.onOpen());
    expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1);

    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });
});
