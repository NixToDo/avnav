/**
 * Created by andreas on 23.02.16.
 */

import React from "react";
import PropTypes from 'prop-types';
import Value from './Value.jsx';
import {useKeyEventHandler} from '../util/GuiHelpers.js';
import {SortableProps, useAvNavSortable} from "../hoc/Sortable";
import {WidgetHead, WidgetProps} from "./WidgetBase";

const DirectWidget=(wprops)=>{
    const props=wprops.translateFunction?{...wprops,...wprops.translateFunction(wprops)}:wprops;
    useKeyEventHandler(wprops,"widget");
    const sortableProps=useAvNavSortable(props.dragId)
    let classes="widget ";
    if (props.isAverage) classes+=" average";
    if (props.className) classes+=" "+props.className;
    let val;
    let vdef=props.default||'0';
    if (props.value !== undefined) {
        val=props.formatter?props.formatter(props.value):vdef+"";
    }
    else{
        if (! isNaN(vdef) && props.formatter) val=props.formatter(vdef);
        else val=vdef+"";
    }
    const style={...props.style,...sortableProps.style};
    return (
        <div className={classes} onClick={props.onClick} {...sortableProps} style={style}>
            <WidgetHead {...props}/>
            <div className="resize">
                <div className='widgetData'>
                    <Value value={val}/>
                </div>
            </div>
        </div>
    );
}

DirectWidget.propTypes = {
    name: PropTypes.string,
    unit: PropTypes.string,
    ...SortableProps,
    ...WidgetProps,
    value: PropTypes.any,
    isAverage: PropTypes.bool,
    formatter: PropTypes.func.isRequired,
    default: PropTypes.string,
    translateFunction: PropTypes.func,
};
DirectWidget.editableParameters={
    caption:true,
    unit:true,
    formatter:true,
    formatterParameters: true,
    value: true
};

export default DirectWidget;